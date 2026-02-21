// src/components/billing/TrialConversionModal.tsx
// Modal shown when trial expires — forces plan selection before continuing.

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Check,
  X,
  Crown,
  Zap,
  Loader2,
  Star,
  ArrowRight,
  BarChart3,
  Clock,
  Activity,
} from 'lucide-react';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useCreateCheckoutSession } from '@/lib/hooks/useSubscription';
import { useTrialProgress } from '@/lib/hooks/useSubscription';
import { PLAN_DETAILS } from '@/lib/config/planDetails';
import type { BillingCycle } from '@/lib/types/subscription';

interface TrialConversionModalProps {
  isOpen: boolean;
  // Cannot be dismissed — user must select a plan
}

export function TrialConversionModal({ isOpen }: TrialConversionModalProps) {
  const { activeOrgId: organizationId } = useOrg();
  const createCheckoutSession = useCreateCheckoutSession();
  const { data: trialProgress } = useTrialProgress(organizationId);

  const [selectedPlan, setSelectedPlan] = useState<'basic' | 'pro'>('pro');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  const meetingsUsed = trialProgress?.meetingsUsed ?? 0;
  const daysUsed = trialProgress ? trialProgress.daysTotal - trialProgress.daysRemaining : 14;

  // Show the Pro credits nudge if they used more than 50 credits worth
  // (credits usage is approximated via meetings as proxy here)
  const showProNudge = meetingsUsed > 5;

  const handleSelectPlan = async () => {
    if (!organizationId) {
      toast.error('No active organization found');
      return;
    }
    try {
      await createCheckoutSession.mutateAsync({
        org_id: organizationId,
        plan_slug: selectedPlan,
        billing_cycle: billingCycle,
        success_url: `${window.location.origin}/settings/billing?upgrade=success`,
        cancel_url: `${window.location.origin}/settings/billing?upgrade=cancelled`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start checkout';
      toast.error(message);
    }
  };

  const plans = [PLAN_DETAILS.basic, PLAN_DETAILS.pro] as const;

  return (
    <Dialog open={isOpen} onOpenChange={() => {/* Cannot be dismissed */}}>
      <DialogContent
        // Hide the default close button — user must select a plan
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto [&>button]:hidden"
      >
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-5 h-5 text-amber-500" />
            <DialogTitle className="text-xl font-bold">Your trial has ended</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
            Choose a plan to continue — your data is safe and waiting for you.
          </DialogDescription>
        </DialogHeader>

        {/* Trial stats */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-4 mt-2">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Your trial stats
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{meetingsUsed}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">meetings processed</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{daysUsed}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">days of use</p>
              </div>
            </div>
          </div>

          {showProNudge && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5" />
                With Pro you&apos;d get 250 bundled credits every month — keeping AI-powered analysis running automatically.
              </p>
            </div>
          )}
        </div>

        {/* Billing cycle toggle */}
        <div className="flex justify-center mt-4">
          <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-800">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                billingCycle === 'monthly'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5',
                billingCycle === 'yearly'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              Annual
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold">
                Save 17%
              </span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          {plans.map((plan) => {
            const isSelected = selectedPlan === plan.slug;
            const price = billingCycle === 'yearly' ? plan.yearlyPrice / 12 : plan.monthlyPrice;
            const priceLabel = billingCycle === 'yearly'
              ? `${plan.currency}${(plan.yearlyPrice / 12).toFixed(0)}/mo`
              : `${plan.currency}${plan.monthlyPrice}/mo`;
            const billedNote = billingCycle === 'yearly'
              ? `Billed ${plan.currency}${plan.yearlyPrice}/yr`
              : 'Billed monthly';

            return (
              <button
                key={plan.slug}
                onClick={() => setSelectedPlan(plan.slug)}
                className={cn(
                  'relative text-left rounded-xl border-2 p-4 transition-all duration-150',
                  isSelected
                    ? plan.slug === 'pro'
                      ? 'border-[#37bd7e] bg-emerald-50 dark:bg-emerald-950/20'
                      : 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600'
                )}
              >
                {plan.badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-[#37bd7e] text-white text-[10px] font-semibold whitespace-nowrap">
                    {plan.badge}
                  </span>
                )}

                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {plan.slug === 'pro' ? (
                        <Crown className="w-4 h-4 text-[#37bd7e]" />
                      ) : (
                        <Zap className="w-4 h-4 text-blue-500" />
                      )}
                      <span className="font-bold text-gray-900 dark:text-white text-sm">
                        {plan.name}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">
                      {plan.tagline}
                    </p>
                  </div>
                  <div
                    className={cn(
                      'w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 transition-colors',
                      isSelected
                        ? plan.slug === 'pro'
                          ? 'border-[#37bd7e] bg-[#37bd7e]'
                          : 'border-blue-500 bg-blue-500'
                        : 'border-gray-300 dark:border-gray-600'
                    )}
                  >
                    {isSelected && <Check className="w-2.5 h-2.5 text-white m-auto" strokeWidth={3} />}
                  </div>
                </div>

                <div className="mb-3">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {priceLabel}
                  </span>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{billedNote}</p>
                </div>

                <ul className="space-y-1.5">
                  {plan.features.filter(f => f.included).slice(0, 5).map((feature) => (
                    <li key={feature.name} className="flex items-start gap-1.5">
                      <Check className={cn(
                        'w-3.5 h-3.5 flex-shrink-0 mt-0.5',
                        plan.slug === 'pro' ? 'text-[#37bd7e]' : 'text-blue-500'
                      )} strokeWidth={2.5} />
                      <span className={cn(
                        'text-xs leading-snug',
                        feature.highlight
                          ? 'text-gray-900 dark:text-white font-medium'
                          : 'text-gray-600 dark:text-gray-400'
                      )}>
                        {feature.value !== 'true' ? feature.value : feature.name}
                      </span>
                    </li>
                  ))}
                  {plan.features.filter(f => !f.included).slice(0, 2).map((feature) => (
                    <li key={feature.name} className="flex items-start gap-1.5 opacity-50">
                      <X className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-400" strokeWidth={2.5} />
                      <span className="text-xs text-gray-400 dark:text-gray-500 leading-snug line-through">
                        {feature.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-4">
          <Button
            onClick={handleSelectPlan}
            disabled={createCheckoutSession.isPending}
            className="w-full bg-[#37bd7e] hover:bg-[#2da76c] text-white font-semibold h-10"
          >
            {createCheckoutSession.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ArrowRight className="w-4 h-4 mr-2" />
            )}
            {createCheckoutSession.isPending
              ? 'Redirecting to checkout...'
              : `Continue with ${PLAN_DETAILS[selectedPlan].name} — ${selectedPlan === 'basic' ? '£29' : '£99'}/mo`}
          </Button>
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-2">
            Secure checkout via Stripe. Cancel anytime.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default TrialConversionModal;

/**
 * BillingSettingsPage — Billing & Subscription management under Settings.
 *
 * Layout:
 *   - Current Plan section: plan name, status badge, next billing date
 *   - Stripe Integration: manage subscription button or "coming soon" placeholder
 *   - Credit Packs section: link to credits page / top-up
 */

import { useNavigate } from 'react-router-dom';
import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { useOrg } from '@/lib/contexts/OrgContext';
import {
  useCurrentSubscription,
  useCreatePortalSession,
} from '@/lib/hooks/useSubscription';
import {
  CreditCard,
  Wallet,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  ArrowRight,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  const navigate = useNavigate();
  const { activeOrgId: organizationId } = useOrg();
  const { subscription, trial, isLoading, error } = useCurrentSubscription();
  const createPortalSession = useCreatePortalSession();

  const currentPlan = subscription?.plan;
  const hasStripeCustomer = Boolean(subscription?.stripe_customer_id);

  const handleManageBilling = async () => {
    if (!organizationId) return;
    try {
      await createPortalSession.mutateAsync({
        org_id: organizationId,
        return_url: window.location.href,
      });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to open billing portal');
    }
  };

  // Format next billing date from subscription
  const nextBillingDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <SettingsPageWrapper title="Billing & Subscription" description="Manage your plan, subscription, and credit packs">
      <div className="space-y-6">

        {/* ================================================================
            Current Plan Section
        ================================================================ */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#37bd7e]" />
            Current Plan
          </h3>

          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
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
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xl font-bold text-gray-900 dark:text-white">
                    {currentPlan?.name ?? 'Professional Plan'}
                  </span>
                  {subscription?.status && (
                    <StatusBadge status={subscription.status} />
                  )}
                  {!subscription && (
                    <StatusBadge status="active" />
                  )}
                </div>

                {/* Plan details grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-1">
                  {/* Monthly cost */}
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Monthly Cost
                    </p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {currentPlan?.price_monthly != null
                        ? `£${currentPlan.price_monthly}/mo`
                        : '£29/mo'}
                    </p>
                  </div>

                  {/* Next billing */}
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Next Billing
                    </p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {nextBillingDate ?? '—'}
                    </p>
                    {!nextBillingDate && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        Available once Stripe is connected
                      </p>
                    )}
                  </div>

                  {/* Trial info if trialing */}
                  {trial?.isTrialing && trial.daysRemaining != null && (
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Trial
                      </p>
                      <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                        {trial.daysRemaining}d left
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ================================================================
            Stripe Integration Section
        ================================================================ */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#37bd7e]" />
            Subscription Management
          </h3>

          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            {hasStripeCustomer ? (
              /* Stripe is connected — show manage button */
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Manage your subscription
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Update payment method, view invoices, change or cancel your plan via the Stripe customer portal.
                  </p>
                </div>
                <Button
                  onClick={handleManageBilling}
                  disabled={createPortalSession.isPending}
                  className="bg-[#37bd7e] hover:bg-[#2da76c] text-white flex-shrink-0"
                >
                  {createPortalSession.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <ExternalLink className="w-4 h-4 mr-2" />
                  )}
                  Manage Subscription
                </Button>
              </div>
            ) : (
              /* Stripe not yet connected — coming soon placeholder */
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Coming Soon — Stripe Billing Integration
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Full subscription management via Stripe is on its way. Once connected, you'll be able to update your payment method, download invoices, and manage your plan directly from here.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-[#37bd7e]" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Your current plan is active and will be managed here once Stripe is live
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ================================================================
            Credit Packs Section
        ================================================================ */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-[#37bd7e]" />
            AI Credits
          </h3>

          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                  Top up with credit packs
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Purchase additional AI credit packs to power copilot, meeting intelligence, and autonomous research features.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => navigate('/settings/credits')}
                className="flex-shrink-0 hover:border-[#37bd7e] hover:text-[#37bd7e]"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Manage Credits
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </section>

      </div>
    </SettingsPageWrapper>
  );
}

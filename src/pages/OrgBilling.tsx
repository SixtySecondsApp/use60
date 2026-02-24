// src/pages/OrgBilling.tsx
// Organization billing management page

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  Receipt,
  Settings,
  AlertTriangle,
  Check,
  Clock,
  ArrowUpRight,
  Users,
  Calendar,
  TrendingUp,
  ExternalLink,
} from 'lucide-react';
import { useOrg } from '@/lib/contexts/OrgContext';
import {
  useCurrentSubscription,
  usePlans,
  useBillingHistory,
  useCreatePortalSession,
  useChangePlan,
} from '../lib/hooks/useSubscription';
import { useCurrency } from '../lib/hooks/useCurrency';
import { PricingCard } from '../components/subscription/PricingCard';
import { BillingToggle } from '../components/subscription/BillingToggle';
import { formatCurrency, getPricingDisplayInfo } from '../lib/types/subscription';
import type { BillingCycle, SubscriptionPlan } from '../lib/types/subscription';

export function OrgBillingPage() {
  const { activeOrgId: organizationId } = useOrg();
  const {
    subscription,
    trial,
    usage,
    isLoading,
    error,
  } = useCurrentSubscription();
  const { data: plans } = usePlans();
  const { data: billingHistory } = useBillingHistory(organizationId);
  const createPortalSession = useCreatePortalSession();
  const changePlan = useChangePlan();
  const { formatPrice: formatCurrencyPrice } = useCurrency();

  const [showPlanSelector, setShowPlanSelector] = useState(false);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  // Helper to get formatted price for a plan
  const getFormattedPrice = (plan: SubscriptionPlan) => {
    const price = billingCycle === 'yearly'
      ? Math.round(plan.price_yearly / 12)
      : plan.price_monthly;
    return formatCurrencyPrice(price);
  };

  const getFormattedYearlyPrice = (plan: SubscriptionPlan) => {
    return formatCurrencyPrice(plan.price_yearly);
  };

  const handleManageBilling = async () => {
    if (!organizationId) return;
    await createPortalSession.mutateAsync({
      org_id: organizationId,
      return_url: window.location.href,
    });
  };

  const handleChangePlan = async (plan: SubscriptionPlan) => {
    if (!organizationId) return;
    await changePlan.mutateAsync({
      orgId: organizationId,
      newPlanId: plan.id,
      billingCycle,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Error loading billing</h2>
          <p className="text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  const currentPlan = subscription?.plan;
  const displayPlans = plans?.filter(p => p.slug !== 'free').sort((a, b) => a.display_order - b.display_order) || [];

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 lg:pt-24 pb-8">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-white">Billing & Subscription</h1>
          <p className="text-slate-400 mt-1">Manage your subscription and billing settings</p>
        </div>

        {/* Trial Banner */}
        {trial.isTrialing && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-blue-400" />
                <div>
                  <p className="font-medium text-white">
                    {trial.daysRemaining} days left in your trial
                  </p>
                  <p className="text-sm text-slate-400">
                    {trial.hasPaymentMethod
                      ? 'Your subscription will start automatically'
                      : 'Add a payment method to continue after trial'}
                  </p>
                </div>
              </div>
              {!trial.hasPaymentMethod && (
                <button
                  onClick={handleManageBilling}
                  disabled={createPortalSession.isPending}
                  className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
                >
                  Add Payment Method
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Current Plan Card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Plan Overview */}
          <div className="lg:col-span-2 p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Current Plan</h2>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-white">
                    {currentPlan?.name || 'No Plan'}
                  </span>
                  <StatusBadge status={subscription?.status || 'none'} />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPlanSelector(!showPlanSelector)}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors"
                >
                  {showPlanSelector ? 'Hide Plans' : 'Change Plan'}
                </button>
                <button
                  onClick={handleManageBilling}
                  disabled={createPortalSession.isPending || !subscription?.stripe_customer_id}
                  className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Manage Billing
                  </span>
                </button>
              </div>
            </div>

            {currentPlan && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                  icon={<CreditCard className="w-4 h-4" />}
                  label="Monthly Cost"
                  value={formatCurrency(currentPlan.price_monthly, currentPlan.currency)}
                />
                <StatCard
                  icon={<Calendar className="w-4 h-4" />}
                  label="Calls/Month"
                  value={currentPlan.max_meetings_per_month?.toString() || 'Unlimited'}
                />
                <StatCard
                  icon={<Users className="w-4 h-4" />}
                  label="Users"
                  value={currentPlan.max_users?.toString() || 'Unlimited'}
                />
                <StatCard
                  icon={<Clock className="w-4 h-4" />}
                  label="Data Retention"
                  value={currentPlan.meeting_retention_months
                    ? `${currentPlan.meeting_retention_months} months`
                    : 'Unlimited'}
                />
              </div>
            )}

            {!subscription && (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-4">You don't have an active subscription</p>
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
                >
                  View Plans
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>

          {/* Usage Card */}
          <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">Current Usage</h2>
            {usage ? (
              <div className="space-y-4">
                <UsageBar
                  label="Calls"
                  used={usage.meetings.used}
                  limit={usage.meetings.limit}
                  percentUsed={usage.meetings.percentUsed}
                />
                <UsageBar
                  label="Users"
                  used={usage.users.active}
                  limit={usage.users.limit}
                  percentUsed={usage.users.limit
                    ? Math.round((usage.users.active / usage.users.limit) * 100)
                    : 0}
                />
                {usage.users.overageCount > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-sm text-amber-400">
                      {usage.users.overageCount} additional seat{usage.users.overageCount > 1 ? 's' : ''}{' '}
                      ({formatCurrency(usage.users.overageAmount, 'GBP')}/month)
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-slate-400">No usage data available</p>
            )}
          </div>
        </div>

        {/* Plan Selector */}
        {showPlanSelector && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-8"
          >
            <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50 overflow-visible">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">Choose a Plan</h2>
                <BillingToggle
                  value={billingCycle}
                  onChange={setBillingCycle}
                  yearlyDiscount={20}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                {displayPlans.map((plan, index) => (
                  <PricingCard
                    key={plan.id}
                    plan={plan}
                    billingCycle={billingCycle}
                    isCurrentPlan={currentPlan?.id === plan.id}
                    isPopular={plan.slug === 'growth'}
                    onSelect={handleChangePlan}
                    isLoading={changePlan.isPending}
                    formattedPrice={getFormattedPrice(plan)}
                    formattedYearlyPrice={getFormattedYearlyPrice(plan)}
                    yearlyDiscount={20}
                    index={index}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Billing History */}
        <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Billing History</h2>
            <button
              onClick={handleManageBilling}
              disabled={createPortalSession.isPending || !subscription?.stripe_customer_id}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
            >
              View all invoices
            </button>
          </div>

          {billingHistory && billingHistory.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Description</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Amount</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Status</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {billingHistory.items.slice(0, 5).map((item) => (
                    <tr key={item.id} className="border-b border-slate-700/50">
                      <td className="py-3 px-4 text-sm text-slate-300">
                        {new Date(item.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-sm text-white">
                        {item.description || item.event_type}
                      </td>
                      <td className="py-3 px-4 text-sm text-white">
                        {formatCurrency(item.amount, item.currency)}
                      </td>
                      <td className="py-3 px-4">
                        <InvoiceStatusBadge status={item.status} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        {item.hosted_invoice_url && (
                          <a
                            href={item.hosted_invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
                          >
                            View
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Receipt className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No billing history yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    active: { color: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'Active' },
    trialing: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Trial' },
    past_due: { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Past Due' },
    canceled: { color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', label: 'Canceled' },
    paused: { color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', label: 'Paused' },
    none: { color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', label: 'No Plan' },
  };

  const config = statusConfig[status] || statusConfig.none;

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full border ${config.color}`}>
      {config.label}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    paid: { color: 'bg-green-500/20 text-green-400', label: 'Paid' },
    pending: { color: 'bg-amber-500/20 text-amber-400', label: 'Pending' },
    failed: { color: 'bg-red-500/20 text-red-400', label: 'Failed' },
    refunded: { color: 'bg-slate-500/20 text-slate-400', label: 'Refunded' },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>
      {config.label}
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-slate-700/30">
      <div className="flex items-center gap-2 text-slate-400 mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function UsageBar({
  label,
  used,
  limit,
  percentUsed,
}: {
  label: string;
  used: number;
  limit: number | null;
  percentUsed: number;
}) {
  const isOverLimit = percentUsed >= 100;
  const isWarning = percentUsed >= 80;

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="text-slate-400">{label}</span>
        <span className="text-white">
          {used} {limit ? `/ ${limit}` : ''}
        </span>
      </div>
      {limit && (
        <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(percentUsed, 100)}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={`h-full rounded-full ${
              isOverLimit
                ? 'bg-red-500'
                : isWarning
                  ? 'bg-amber-500'
                  : 'bg-blue-500'
            }`}
          />
        </div>
      )}
    </div>
  );
}

export default OrgBillingPage;

// src/pages/Pricing.tsx
// Dynamic pricing page with database-driven plans and currency conversion

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Shield, Zap, Users, Clock, ChevronDown, Check, X, Sparkles, Gift } from 'lucide-react';
import { usePublicPlans, useStartFreeTrial, useCurrentSubscription } from '../lib/hooks/useSubscription';
import { useCurrency } from '../lib/hooks/useCurrency';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg } from '@/lib/contexts/OrgContext';
import { PricingCard } from '../components/subscription/PricingCard';
import { BillingToggle } from '../components/subscription/BillingToggle';
import { CurrencySelector } from '../components/subscription/CurrencySelector';
import type { SubscriptionPlan, BillingCycle } from '../lib/types/subscription';

// Enterprise plan placeholder (contact sales, no database entry needed)
const ENTERPRISE_PLAN: SubscriptionPlan = {
  id: 'enterprise',
  name: 'Enterprise',
  slug: 'enterprise',
  description: 'For large organizations with custom needs',
  price_monthly: 0,
  price_yearly: 0,
  currency: 'USD',
  max_meetings_per_month: null,
  max_users: null,
  max_ai_tokens_per_month: null,
  max_storage_mb: null,
  meeting_retention_months: null,
  included_seats: 0,
  per_seat_price: 0,
  features: {
    ai_summaries: true,
    analytics: true,
    team_insights: true,
    api_access: true,
    custom_branding: true,
    priority_support: true,
    integrations: true,
    sso: true,
    dedicated_support: true,
  },
  stripe_product_id: null,
  stripe_price_id_monthly: null,
  stripe_price_id_yearly: null,
  stripe_seat_price_id: null,
  trial_days: 0,
  is_active: true,
  is_default: false,
  is_free_tier: false,
  is_public: true,
  display_order: 999,
  badge_text: null,
  cta_text: 'Contact Sales',
  cta_url: 'mailto:sales@sixty.ai?subject=Enterprise%20Plan%20Inquiry',
  highlight_features: [
    'Unlimited meetings',
    'Unlimited team members',
    'Custom integrations',
    'Dedicated success manager',
    'SSO & SAML',
    'Custom SLA',
  ],
  stripe_synced_at: null,
  stripe_sync_error: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Hero animation variants
const heroVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2
    }
  }
};

const heroChildVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1]
    }
  }
};

export function PricingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeOrgId: organizationId } = useOrg();
  const { data: plans, isLoading: plansLoading } = usePublicPlans();
  const { subscription, trial } = useCurrentSubscription();
  const startTrial = useStartFreeTrial();
  const {
    currency,
    setCurrency,
    formatPrice,
    availableCurrencies,
    isLoading: currencyLoading,
  } = useCurrency();

  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  // Check if user is on trial or has active subscription
  const hasActiveTrial = trial?.isTrialing && !trial?.hasExpired;
  const hasActiveSubscription = subscription?.status === 'active';

  // Process plans from database - add enterprise at the end
  const displayPlans = useMemo(() => {
    if (!plans) return [ENTERPRISE_PLAN];

    // Plans are already sorted by display_order from the API
    // Add enterprise plan at the end
    return [...plans, ENTERPRISE_PLAN];
  }, [plans]);

  // Check if there's a free tier available
  const hasFreeTier = useMemo(() => {
    return plans?.some(p => p.is_free_tier) || false;
  }, [plans]);

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    // Enterprise plan - contact sales
    if (plan.slug === 'enterprise') {
      const url = plan.cta_url || 'mailto:sales@sixty.ai?subject=Enterprise%20Plan%20Inquiry';
      window.location.href = url;
      return;
    }

    // Free tier - different flow
    if (plan.is_free_tier) {
      if (!user) {
        navigate(`/signup?plan=${plan.slug}`);
        return;
      }
      if (!organizationId) {
        navigate(`/onboarding?plan=${plan.slug}`);
        return;
      }
      // TODO: Assign free tier directly
      navigate('/dashboard');
      return;
    }

    // If not logged in, redirect to signup with plan info
    if (!user) {
      navigate(`/signup?plan=${plan.slug}&billing=${billingCycle}`);
      return;
    }

    // If no organization, redirect to create one
    if (!organizationId) {
      navigate(`/onboarding?plan=${plan.slug}&billing=${billingCycle}`);
      return;
    }

    setSelectedPlan(plan.id);

    try {
      await startTrial.mutateAsync({
        org_id: organizationId,
        plan_id: plan.id,
      });
      navigate('/dashboard?trial_started=true');
    } catch (error) {
      console.error('Failed to start trial:', error);
      setSelectedPlan(null);
    }
  };

  // Get formatted prices for a plan
  const getFormattedPrices = (plan: SubscriptionPlan) => {
    // Use database prices directly
    const monthlyPrice = formatPrice(plan.price_monthly);
    const yearlyTotal = plan.price_yearly || Math.round(plan.price_monthly * 12 * 0.8); // 20% discount if not set
    const yearlyMonthly = formatPrice(Math.round(yearlyTotal / 12));
    const yearlyPrice = formatPrice(yearlyTotal);

    return {
      monthlyPrice,
      yearlyMonthly,
      yearlyPrice,
    };
  };

  // Generate comparison features dynamically from plans
  const comparisonFeatures = useMemo(() => {
    const baseFeatures = [
      {
        name: 'Monthly meetings',
        getValue: (p: SubscriptionPlan) => p.is_free_tier ? `${p.max_meetings_per_month}` : p.max_meetings_per_month ? `${p.max_meetings_per_month}` : 'Unlimited'
      },
      {
        name: 'Data retention',
        getValue: (p: SubscriptionPlan) => p.meeting_retention_months ? `${p.meeting_retention_months} months` : 'Unlimited'
      },
      {
        name: 'Team members',
        getValue: (p: SubscriptionPlan) => p.max_users ? `${p.max_users}${p.max_users > 1 ? ' (add more)' : ''}` : 'Unlimited'
      },
      { name: 'AI summaries', getValue: (p: SubscriptionPlan) => p.features?.ai_summaries || false },
      { name: 'Meeting transcripts', getValue: () => true },
      { name: 'Action item tracking', getValue: () => true },
      { name: 'CRM integrations', getValue: (p: SubscriptionPlan) => p.features?.integrations || false },
      { name: 'Advanced analytics', getValue: (p: SubscriptionPlan) => p.features?.analytics || false },
      { name: 'Team insights', getValue: (p: SubscriptionPlan) => p.features?.team_insights || false },
      { name: 'API access', getValue: (p: SubscriptionPlan) => p.features?.api_access || false },
      { name: 'Custom branding', getValue: (p: SubscriptionPlan) => p.features?.custom_branding || false },
      { name: 'SSO / SAML', getValue: (p: SubscriptionPlan) => p.features?.sso || false },
      { name: 'Dedicated support', getValue: (p: SubscriptionPlan) => p.features?.dedicated_support || false },
      { name: 'Custom SLA', getValue: (p: SubscriptionPlan) => p.slug === 'enterprise' },
    ];

    return baseFeatures;
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Gradient overlays for premium effect */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-50 border-b border-gray-200 dark:border-gray-800/50 bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <img
                src="https://www.sixtyseconds.ai/images/logo.png"
                alt="Sixty Seconds"
                className="h-8 w-auto"
              />
              <span className="text-xl font-bold text-gray-900 dark:text-white hidden sm:inline">
                Sixty Seconds
              </span>
            </Link>
            <div className="flex items-center gap-4">
              {user ? (
                <Link
                  to="/dashboard"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/signup"
                    className="text-sm px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            variants={heroVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.h1
              variants={heroChildVariants}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6"
            >
              Choose the perfect plan
              <br />
              <span className="bg-gradient-to-r from-blue-500 to-emerald-500 bg-clip-text text-transparent">
                for your team
              </span>
            </motion.h1>
            <motion.p
              variants={heroChildVariants}
              className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-6"
            >
              {hasActiveTrial ? (
                <>
                  You have <span className="text-blue-500 font-semibold">{trial?.daysRemaining} days</span> left in your trial.
                  <br className="hidden sm:block" />
                  Upgrade now to keep your data and unlock all features.
                </>
              ) : hasActiveSubscription ? (
                <>
                  You're on the <span className="text-emerald-500 font-semibold">{subscription?.plan?.name}</span> plan.
                  <br className="hidden sm:block" />
                  Upgrade or change your plan anytime.
                </>
              ) : hasFreeTier ? (
                <>
                  Start free with up to 50 meetings per month.
                  <br className="hidden sm:block" />
                  Upgrade anytime for unlimited access.
                </>
              ) : (
                <>
                  Start with a 14-day free trial. No credit card required.
                  <br className="hidden sm:block" />
                  Upgrade, downgrade, or cancel anytime.
                </>
              )}
            </motion.p>

            {/* Free Trial CTA for non-users */}
            {!user && (
              <motion.div variants={heroChildVariants} className="mb-8">
                <Link
                  to="/signup"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:from-emerald-600 hover:to-emerald-700 transition-all"
                >
                  {hasFreeTier ? (
                    <>
                      <Gift className="w-5 h-5" />
                      Start Free
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Get Started Free
                    </>
                  )}
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-500">
                  {hasFreeTier ? 'Free forever • No credit card required' : '14-day free trial • No credit card required'}
                </p>
              </motion.div>
            )}

            {/* Controls: Currency + Billing Toggle */}
            <motion.div
              variants={heroChildVariants}
              className="flex flex-col sm:flex-row items-center justify-center gap-6"
            >
              <CurrencySelector
                value={currency}
                onChange={setCurrency}
                currencies={availableCurrencies}
                isLoading={currencyLoading}
              />
              <BillingToggle
                value={billingCycle}
                onChange={setBillingCycle}
                yearlyDiscount={20}
              />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="relative z-10 pb-16 sm:pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {plansLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-[600px] rounded-2xl bg-gray-100 dark:bg-gray-900/50 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 ${displayPlans.length <= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-5'}`}>
              {displayPlans.map((plan, index) => {
                const prices = getFormattedPrices(plan);
                const isEnterprise = plan.slug === 'enterprise';
                const isCurrentPlan = subscription?.plan?.slug === plan.slug;
                const isFreeTier = plan.is_free_tier;

                return (
                  <PricingCard
                    key={plan.id}
                    plan={plan}
                    billingCycle={billingCycle}
                    isCurrentPlan={isCurrentPlan}
                    isPopular={plan.badge_text === 'Popular' || plan.slug === 'pro'}
                    isEnterprise={isEnterprise}
                    isFreeTier={isFreeTier}
                    onSelect={handleSelectPlan}
                    isLoading={selectedPlan === plan.id && startTrial.isPending}
                    formattedPrice={
                      isFreeTier ? '$0' : billingCycle === 'yearly' ? prices.yearlyMonthly : prices.monthlyPrice
                    }
                    formattedYearlyPrice={isFreeTier ? '$0' : prices.yearlyPrice}
                    yearlyDiscount={20}
                    index={index}
                    ctaText={plan.cta_text}
                    highlightFeatures={plan.highlight_features}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Features Comparison */}
      <section className="relative z-10 py-16 border-t border-gray-200 dark:border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Compare all features
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Choose the plan that best fits your team's needs
            </p>
          </motion.div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200 dark:border-gray-700/50">
                  <th className="py-4 px-6 text-left text-sm font-semibold text-gray-900 dark:text-white">
                    Feature
                  </th>
                  {displayPlans.map((plan) => (
                    <th
                      key={plan.id}
                      className={`py-4 px-6 text-center text-sm font-semibold ${
                        plan.slug === 'pro' || plan.badge_text === 'Popular'
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((feature, index) => (
                  <motion.tr
                    key={feature.name}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.03 }}
                    className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
                  >
                    <td className="py-4 px-6 text-sm text-gray-700 dark:text-gray-300">
                      {feature.name}
                    </td>
                    {displayPlans.map((plan) => {
                      const value = feature.getValue(plan);
                      const isPopular = plan.slug === 'pro' || plan.badge_text === 'Popular';
                      return (
                        <td
                          key={plan.id}
                          className={`py-4 px-6 text-center ${isPopular ? 'bg-blue-50/50 dark:bg-blue-500/5' : ''}`}
                        >
                          <FeatureValue value={value} highlight={isPopular} />
                        </td>
                      );
                    })}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="relative z-10 py-16 border-t border-gray-200 dark:border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <TrustBadge
              icon={<Zap className="w-6 h-6" />}
              title="AI-Powered Insights"
              description="Get intelligent summaries and action items from every call"
            />
            <TrustBadge
              icon={<Users className="w-6 h-6" />}
              title="Team Collaboration"
              description="Share insights across your team with easy access controls"
            />
            <TrustBadge
              icon={<Shield className="w-6 h-6" />}
              title="Enterprise Security"
              description="Bank-grade encryption and SOC 2 compliance"
            />
            <TrustBadge
              icon={<Clock className="w-6 h-6" />}
              title="Quick Setup"
              description="Connect your calendar and start recording in minutes"
            />
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="relative z-10 py-16 border-t border-gray-200 dark:border-gray-800/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Frequently Asked Questions
            </h2>
          </motion.div>
          <div className="space-y-4">
            {FAQ_ITEMS.map((item, index) => (
              <FAQItem key={index} question={item.question} answer={item.answer} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-16 border-t border-gray-200 dark:border-gray-800/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600/10 to-emerald-600/10 dark:from-blue-600/20 dark:to-emerald-600/20 backdrop-blur-xl border border-gray-200 dark:border-gray-700/50 p-8 sm:p-12 text-center"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-emerald-500/5" />
            <div className="relative">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                Ready to transform your sales calls?
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
                {hasFreeTier
                  ? 'Start free today. No credit card required.'
                  : 'Start your free 14-day trial today. No credit card required.'
                }
              </p>
              <Link
                to={user ? '/dashboard' : '/signup'}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:from-blue-600 hover:to-blue-700 transition-all"
              >
                {hasFreeTier ? 'Start Free' : 'Get Started Free'}
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-8 border-t border-gray-200 dark:border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500 dark:text-gray-500">
              &copy; {new Date().getFullYear()} Sixty. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link
                to="/privacy"
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                to="/terms"
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// FAQ data
const FAQ_ITEMS = [
  {
    question: 'Is there a free plan?',
    answer: 'Yes! Our Free plan includes up to 50 meetings per month with core features. Perfect for individuals or small teams getting started. No credit card required.',
  },
  {
    question: 'Can I change plans later?',
    answer: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately, and we\'ll prorate your billing accordingly.',
  },
  {
    question: 'What happens when I reach my meeting limit?',
    answer: 'You\'ll receive a notification when you\'re approaching your limit. You can upgrade to a higher plan at any time to increase your allowance.',
  },
  {
    question: 'How does team pricing work?',
    answer: 'The Team plan includes 5 user seats. Need more? Additional seats are available at a discounted rate, and you can add or remove seats anytime.',
  },
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes, you can cancel your subscription at any time. You\'ll continue to have access until the end of your billing period.',
  },
  {
    question: 'Is my data secure?',
    answer: 'Absolutely. We use bank-grade encryption and are SOC 2 compliant. Your meeting data is stored securely and never shared with third parties.',
  },
];

// Helper components
function FeatureValue({ value, highlight = false }: { value: string | boolean; highlight?: boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className={`w-5 h-5 mx-auto ${highlight ? 'text-blue-500' : 'text-emerald-500'}`} />
    ) : (
      <X className="w-5 h-5 mx-auto text-gray-300 dark:text-gray-600" />
    );
  }
  return (
    <span className={`text-sm font-medium ${highlight ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
      {value}
    </span>
  );
}

function TrustBadge({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="text-center"
    >
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-500 mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
    </motion.div>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="rounded-xl bg-white dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 overflow-hidden"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <span className="font-semibold text-gray-900 dark:text-white">{question}</span>
        <ChevronDown
          className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <motion.div
        initial={false}
        animate={{
          height: isOpen ? 'auto' : 0,
          opacity: isOpen ? 1 : 0,
        }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden"
      >
        <p className="px-5 pb-5 text-gray-600 dark:text-gray-400">{answer}</p>
      </motion.div>
    </motion.div>
  );
}

export default PricingPage;

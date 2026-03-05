import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Check, X, ArrowRight, Building2, Shield, Users, Headphones } from 'lucide-react';
import { usePublicPlans, useStartFreeTrial, useCurrentSubscription } from '@/lib/hooks/useSubscription';
import { useCurrency } from '@/lib/hooks/useCurrency';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg } from '@/lib/contexts/OrgContext';
import { PricingCard } from '@/components/subscription/PricingCard';
import { BillingToggle } from '@/components/subscription/BillingToggle';
import { CurrencySelector } from '@/components/subscription/CurrencySelector';
import type { SubscriptionPlan, BillingCycle } from '@/lib/types/subscription';

function FeatureValue({ value, highlight = false }: { value: string | boolean; highlight?: boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className={`w-5 h-5 mx-auto ${highlight ? 'text-blue-500' : 'text-emerald-500'}`} />
    ) : (
      <X className="w-5 h-5 mx-auto text-gray-600" />
    );
  }
  return (
    <span className={`text-sm font-medium ${highlight ? 'text-blue-400' : 'text-gray-300'}`}>
      {value}
    </span>
  );
}

export function PricingSection() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeOrgId: organizationId } = useOrg();
  // Fetch all public plans from the database
  const { data: plans, isLoading: plansLoading } = usePublicPlans();
  const { subscription } = useCurrentSubscription();
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

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    // Use cta_url if provided (e.g., for enterprise "Contact Sales")
    if (plan.cta_url && (plan.slug === 'enterprise' || (plan.price_monthly === 0 && !plan.is_free_tier))) {
      window.location.href = plan.cta_url;
      return;
    }

    if (!user) {
      navigate(`/auth/signup?plan=${plan.slug}&billing=${billingCycle}`);
      return;
    }

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

  // Sort plans by display_order from database
  const allPlans = (plans || []).sort((a, b) =>
    (a.display_order || 0) - (b.display_order || 0)
  );

  // Separate core plans (free, pro, team) from enterprise
  // Enterprise is identified by slug='enterprise' or cta_url containing 'contact' or 'sales'
  const corePlans = allPlans.filter(p =>
    p.slug !== 'enterprise' &&
    !(p.cta_url?.toLowerCase().includes('contact') || p.cta_url?.toLowerCase().includes('sales'))
  );

  const enterprisePlan = allPlans.find(p =>
    p.slug === 'enterprise' ||
    (p.cta_url?.toLowerCase().includes('contact') || p.cta_url?.toLowerCase().includes('sales'))
  );

  const getFormattedPrices = (plan: SubscriptionPlan) => {
    // Use actual prices from database
    const monthlyPrice = formatPrice(plan.price_monthly);
    const yearlyTotal = plan.price_yearly || Math.round(plan.price_monthly * 12 * 0.8);
    const yearlyMonthly = formatPrice(Math.round(yearlyTotal / 12));
    const yearlyPrice = formatPrice(yearlyTotal);

    return {
      monthlyPrice,
      yearlyMonthly,
      yearlyPrice,
    };
  };

  // Build dynamic comparison features from the plans
  const buildComparisonFeatures = () => {
    const features: Array<{
      name: string;
      values: Record<string, string | boolean>;
    }> = [];

    // Meeting limits
    features.push({
      name: 'Meetings',
      values: corePlans.reduce((acc, p) => {
        if (p.is_free_tier) {
          acc[p.slug] = `${p.max_meetings_per_month || 30} total`;
        } else if (p.max_meetings_per_month) {
          acc[p.slug] = `${p.max_meetings_per_month}/month`;
        } else {
          acc[p.slug] = 'Unlimited';
        }
        return acc;
      }, {} as Record<string, string>),
    });

    // Data retention
    features.push({
      name: 'Data retention',
      values: corePlans.reduce((acc, p) => {
        if (p.meeting_retention_months) {
          acc[p.slug] = `${p.meeting_retention_months} months`;
        } else {
          acc[p.slug] = 'Unlimited';
        }
        return acc;
      }, {} as Record<string, string>),
    });

    // Team members (with seat-based pricing for Team plan)
    features.push({
      name: 'Team members',
      values: corePlans.reduce((acc, p) => {
        if (p.slug === 'team' && p.included_seats && p.per_seat_price > 0) {
          // Team plan with seat-based pricing
          const perSeatDisplay = formatPrice(p.per_seat_price);
          acc[p.slug] = `${p.included_seats} included (+${perSeatDisplay}/seat)`;
        } else if (p.max_users) {
          acc[p.slug] = p.max_users === 1 ? '1 user' : `${p.max_users} users`;
        } else {
          acc[p.slug] = 'Unlimited';
        }
        return acc;
      }, {} as Record<string, string>),
    });

    // Boolean features from plan.features
    const featureLabels: Record<string, string> = {
      analytics: 'Analytics',
      team_insights: 'Team insights',
      api_access: 'API access',
      custom_branding: 'Custom branding',
      priority_support: 'Priority support',
    };

    Object.entries(featureLabels).forEach(([key, label]) => {
      features.push({
        name: label,
        values: corePlans.reduce((acc, p) => {
          acc[p.slug] = !!(p.features?.[key] ?? false);
          return acc;
        }, {} as Record<string, boolean>),
      });
    });

    return features;
  };

  const comparisonFeatures = buildComparisonFeatures();

  return (
    <section id="pricing" className="relative z-10 py-16 sm:py-24 bg-[#0f1419] dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Choose the perfect plan
            <br />
            <span className="bg-gradient-to-r from-blue-500 to-emerald-500 bg-clip-text text-transparent">
              for your team
            </span>
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-8">
            Start with a 14-day free trial. No credit card required.
            <br className="hidden sm:block" />
            Upgrade, downgrade, or cancel anytime.
          </p>

          {/* Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-12">
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
          </div>
        </div>

        {/* Core Pricing Cards (3 plans) */}
        <div className="mb-12">
          {plansLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-[600px] rounded-2xl bg-gray-900/50 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {corePlans.map((plan, index) => {
                const prices = getFormattedPrices(plan);
                const isCurrentPlan = subscription?.plan?.slug === plan.slug;
                // Use badge_text from database to determine if popular
                const isPopular = plan.badge_text?.toLowerCase().includes('popular') || plan.slug === 'pro';

                return (
                  <PricingCard
                    key={plan.id}
                    plan={plan}
                    billingCycle={billingCycle}
                    isCurrentPlan={isCurrentPlan}
                    isPopular={isPopular}
                    isEnterprise={false}
                    onSelect={handleSelectPlan}
                    isLoading={selectedPlan === plan.id && startTrial.isPending}
                    formattedPrice={
                      billingCycle === 'yearly' ? prices.yearlyMonthly : prices.monthlyPrice
                    }
                    formattedYearlyPrice={prices.yearlyPrice}
                    yearlyDiscount={20}
                    index={index}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Enterprise Banner */}
        {enterprisePlan && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-24"
          >
            <div className="relative overflow-hidden rounded-2xl border border-gray-700/50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 md:p-12">
              {/* Background decoration */}
              <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-blue-500/20 via-blue-500/10 to-transparent" />
              <div className="absolute bottom-0 left-0 w-1/3 h-2/3 bg-gradient-to-tr from-emerald-500/15 to-transparent" />
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />

              <div className="relative flex flex-col lg:flex-row items-center justify-between gap-8">
                {/* Left side - Text content */}
                <div className="flex-1 text-center lg:text-left">
                  <div className="flex items-center justify-center lg:justify-start gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-blue-500/20 backdrop-blur-sm">
                      <Building2 className="w-6 h-6 text-blue-400" />
                    </div>
                    <h3 className="text-2xl md:text-3xl font-bold text-white">
                      Custom
                    </h3>
                  </div>
                  <p className="text-gray-300 text-lg mb-6 max-w-xl">
                    For organisations with custom needs. Custom integrations, custom functions, and custom features tailored to your workflow.
                  </p>

                  {/* Custom features grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2 text-gray-200">
                      <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      <span className="text-sm font-medium">Custom integrations</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-200">
                      <Users className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      <span className="text-sm font-medium">Unlimited users</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-200">
                      <Headphones className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      <span className="text-sm font-medium">Dedicated support</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-200">
                      <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      <span className="text-sm font-medium">Custom features</span>
                    </div>
                  </div>
                </div>

                {/* Right side - CTA */}
                <div className="flex flex-col items-center lg:items-end gap-4">
                  <div className="text-center lg:text-right">
                    <p className="text-3xl font-bold text-white mb-1">Let's Talk</p>
                    <p className="text-gray-400 text-sm">We'll build it together</p>
                  </div>
                  <button
                    onClick={() => handleSelectPlan(enterprisePlan)}
                    className="group flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-slate-900 font-semibold hover:bg-gray-100 transition-all duration-200 shadow-lg hover:shadow-xl"
                  >
                    {enterprisePlan.cta_text || 'Contact Us'}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Features Comparison */}
        {corePlans.length > 0 && (
          <div className="border-t border-gray-800/50 pt-16">
            <div className="text-center mb-12">
              <h3 className="text-3xl font-bold text-white mb-4">
                Compare all features
              </h3>
              <p className="text-gray-400">
                Choose the plan that best fits your team's needs
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full max-w-4xl mx-auto">
                <thead>
                  <tr className="border-b-2 border-gray-700/50">
                    <th className="py-4 px-6 text-left text-sm font-semibold text-white">
                      Feature
                    </th>
                    {corePlans.map((plan, index) => (
                      <th
                        key={plan.id}
                        className={`py-4 px-6 text-center text-sm font-semibold ${
                          plan.badge_text?.toLowerCase().includes('popular') || plan.slug === 'pro'
                            ? 'text-blue-400'
                            : 'text-white'
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
                      className="border-b border-gray-800/50 hover:bg-gray-900/30 transition-colors"
                    >
                      <td className="py-4 px-6 text-sm text-gray-300">
                        {feature.name}
                      </td>
                      {corePlans.map((plan) => {
                        const value = feature.values[plan.slug];
                        const isPopular = plan.badge_text?.toLowerCase().includes('popular') || plan.slug === 'pro';
                        return (
                          <td
                            key={plan.id}
                            className={`py-4 px-6 text-center ${isPopular ? 'bg-blue-500/5' : ''}`}
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
        )}
      </div>
    </section>
  );
}

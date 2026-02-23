// src/components/subscription/PricingCard.tsx
// Premium glassmorphic pricing card component

import React from 'react';
import { motion } from 'framer-motion';
import { Check, Sparkles, Zap, Users, Building2, Clock, Gift } from 'lucide-react';
import type { SubscriptionPlan, BillingCycle } from '../../lib/types/subscription';
import { formatCurrency } from '../../lib/types/subscription';

// Helper to format seat price
function formatSeatPrice(priceInPence: number, currency: string = 'GBP'): string {
  return formatCurrency(priceInPence, currency);
}

interface PricingCardProps {
  plan: SubscriptionPlan;
  billingCycle: BillingCycle;
  isCurrentPlan?: boolean;
  isPopular?: boolean;
  isEnterprise?: boolean;
  isFreeTier?: boolean;
  onSelect: (plan: SubscriptionPlan) => void;
  isLoading?: boolean;
  formattedPrice: string;
  formattedYearlyPrice?: string;
  yearlyDiscount?: number;
  index?: number;
  ctaText?: string;
  highlightFeatures?: string[];
}

// Card animation variants
const cardVariants = {
  hidden: {
    opacity: 0,
    y: 40,
    scale: 0.95
  },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.1,
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1]
    }
  }),
};

// Badge pulse animation
const badgeVariants = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.05, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut"
    }
  }
};

export function PricingCard({
  plan,
  billingCycle,
  isCurrentPlan = false,
  isPopular = false,
  isEnterprise = false,
  isFreeTier = false,
  onSelect,
  isLoading = false,
  formattedPrice,
  formattedYearlyPrice,
  yearlyDiscount = 20,
  index = 0,
  ctaText,
  highlightFeatures,
}: PricingCardProps) {
  // Use highlight_features if provided, otherwise generate from plan attributes
  const features = highlightFeatures && highlightFeatures.length > 0
    ? highlightFeatures
    : getFeaturesList(plan, isEnterprise, isFreeTier);
  const PlanIcon = getPlanIcon(plan.slug, isFreeTier);

  return (
    // Outer wrapper handles animation + hover. pt-5 gives vertical space for the
    // badge that is now positioned inside the card at -top-4 (negative offset).
    <motion.div
      custom={index}
      initial="hidden"
      animate="visible"
      variants={cardVariants}
      whileHover={{ y: -8, transition: { duration: 0.2 } }}
      className="relative pt-5"
    >
      {/* Card element — badges are positioned inside with overflow-visible so they
          escape the card boundary upward, unaffected by backdrop-blur stacking */}
      <div
        className={`
          relative flex flex-col rounded-2xl p-8
          overflow-visible
          backdrop-blur-xl transition-all duration-300
          ${isPopular
            ? 'bg-gradient-to-b from-blue-600/10 to-gray-900/80 dark:from-blue-600/20 dark:to-gray-900/80'
            : isFreeTier
              ? 'bg-gradient-to-b from-emerald-600/5 to-gray-900/80 dark:from-emerald-600/10 dark:to-gray-900/80'
              : 'bg-white/80 dark:bg-gray-900/80'
          }
          ${isPopular
            ? 'border-2 border-blue-500/50 shadow-lg shadow-blue-500/20'
            : isFreeTier
              ? 'border-2 border-emerald-500/30 shadow-lg shadow-emerald-500/10'
              : 'border border-gray-200 dark:border-gray-700/50'
          }
          ${isCurrentPlan ? 'ring-2 ring-emerald-500/50' : ''}
          hover:border-blue-500/50 dark:hover:border-blue-500/50
          hover:shadow-xl dark:hover:shadow-2xl dark:hover:shadow-black/40
        `}
      >
      {/* Popular badge — inside the card but positioned above its top edge via
          -top-4. overflow-visible on the card lets it escape upward. The badge
          is a child of the card so it shares the same stacking context and is
          never clipped or buried by the card's border or backdrop-blur layer. */}
      {isPopular && (
        <motion.div
          variants={badgeVariants}
          initial="initial"
          animate="animate"
          className="absolute -top-4 left-1/2 -translate-x-1/2 z-50"
        >
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 text-white text-xs font-bold uppercase tracking-wide shadow-lg shadow-blue-500/30 whitespace-nowrap">
            <Sparkles className="w-3.5 h-3.5" />
            {plan.badge_text || 'Most Popular'}
          </span>
        </motion.div>
      )}

      {/* Free tier badge — same inside-card approach */}
      {isFreeTier && !isPopular && (
        <motion.div
          variants={badgeVariants}
          initial="initial"
          animate="animate"
          className="absolute -top-4 left-1/2 -translate-x-1/2 z-50"
        >
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold uppercase tracking-wide shadow-lg shadow-emerald-500/30 whitespace-nowrap">
            <Gift className="w-3.5 h-3.5" />
            Free Forever
          </span>
        </motion.div>
      )}

      {/* Current plan badge — small, top-right corner */}
      {isCurrentPlan && (
        <div className="absolute -top-3 right-6 z-50">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/30">
            Current Plan
          </span>
        </div>
      )}

      {/* Plan header with icon */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className={`
            p-2.5 rounded-xl
            ${isPopular
              ? 'bg-blue-500/20 text-blue-400'
              : isEnterprise
                ? 'bg-purple-500/20 text-purple-400'
                : isFreeTier
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }
          `}>
            <PlanIcon className="w-5 h-5" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">{plan.name}</h3>
        </div>
        {plan.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400">{plan.description}</p>
        )}
      </div>

      {/* Pricing display */}
      <div className="mb-6">
        {isEnterprise ? (
          <div className="py-2">
            <span className="text-3xl font-bold text-gray-900 dark:text-white">Custom</span>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Tailored for your organization
            </p>
          </div>
        ) : isFreeTier ? (
          <div className="py-2">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold text-emerald-500">$0</span>
              <span className="text-gray-500 dark:text-gray-400">/month</span>
            </div>
            <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
              No credit card required
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-1">
              <motion.span
                key={formattedPrice}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="text-4xl font-bold text-gray-900 dark:text-white"
              >
                {formattedPrice}
              </motion.span>
              <span className="text-gray-500 dark:text-gray-400">/month</span>
            </div>
            {billingCycle === 'yearly' && yearlyDiscount > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium"
              >
                Save {yearlyDiscount}% with annual billing
              </motion.p>
            )}
            {billingCycle === 'yearly' && formattedYearlyPrice && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Billed annually at {formattedYearlyPrice}
              </p>
            )}
          </>
        )}
      </div>

      {/* Trial badge - don't show for free tier */}
      {plan.trial_days > 0 && !isCurrentPlan && !isEnterprise && !isFreeTier && (
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-blue-400">
              {plan.trial_days}-day free trial
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
            No credit card required
          </p>
        </div>
      )}

      {/* Features list */}
      <div className="flex-1 mb-8">
        <ul className="space-y-4">
          {features.map((feature, idx) => (
            <motion.li
              key={idx}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + idx * 0.05 }}
              className="flex items-start gap-3"
            >
              <div className={`
                mt-0.5 p-0.5 rounded-full
                ${isPopular
                  ? 'bg-blue-500/20 text-blue-400'
                  : isFreeTier
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-emerald-500/20 text-emerald-400'
                }
              `}>
                <Check className="w-4 h-4" />
              </div>
              <span className="text-sm text-gray-700 dark:text-gray-300">{feature}</span>
            </motion.li>
          ))}
        </ul>
      </div>

      {/* CTA Button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onSelect(plan)}
        disabled={isLoading || isCurrentPlan}
        className={`
          w-full py-3.5 px-6 rounded-xl font-semibold text-base
          transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          ${isCurrentPlan
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500'
            : isEnterprise
              ? 'bg-transparent border-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500'
              : isFreeTier
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:from-emerald-600 hover:to-teal-600'
                : isPopular
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:from-blue-600 hover:to-blue-700'
                  : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100'
          }
        `}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Processing...
          </span>
        ) : isCurrentPlan ? (
          'Current Plan'
        ) : ctaText ? (
          ctaText
        ) : isEnterprise ? (
          'Contact Sales'
        ) : isFreeTier ? (
          'Get Started Free'
        ) : (
          'Start Free Trial'
        )}
      </motion.button>

      {/* Per-seat pricing note for Team plan */}
      {plan.slug === 'team' && plan.per_seat_price > 0 && (
        <div className="mt-4 text-center">
          <p className="text-xs text-blue-400 font-medium">
            Includes {plan.included_seats} seats
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            +{formatSeatPrice(plan.per_seat_price, plan.currency)}/seat for additional users
          </p>
        </div>
      )}
      </div>
    </motion.div>
  );
}

/**
 * Get icon for plan type
 */
function getPlanIcon(slug: string, isFreeTier: boolean = false) {
  if (isFreeTier) return Gift;

  switch (slug) {
    case 'free':
      return Gift;
    case 'starter':
      return Zap;
    case 'pro':
      return Sparkles;
    case 'team':
      return Users;
    case 'enterprise':
      return Building2;
    default:
      return Zap;
  }
}

/**
 * Generate features list based on plan attributes
 */
function getFeaturesList(plan: SubscriptionPlan, isEnterprise: boolean = false, isFreeTier: boolean = false): string[] {
  if (isEnterprise) {
    return [
      'Unlimited calls & recordings',
      'Unlimited data retention',
      'Unlimited team members',
      'Advanced AI analytics',
      'Custom integrations',
      'Dedicated success manager',
      'SLA & priority support',
      'Custom security controls',
      'SSO & SAML',
    ];
  }

  if (isFreeTier) {
    const features: string[] = [];
    // Free tier uses TOTAL meetings (not per month) - display from database value
    features.push(`${plan.max_meetings_per_month || 30} free meetings total`);
    features.push('AI meeting summaries');
    features.push('Meeting transcripts');
    features.push('Action item tracking');
    if (plan.meeting_retention_months) {
      features.push(`${plan.meeting_retention_months} month data retention`);
    }
    return features;
  }

  const features: string[] = [];

  // Meetings limit
  if (plan.max_meetings_per_month) {
    features.push(`${plan.max_meetings_per_month} calls per month`);
  } else {
    features.push('Unlimited calls');
  }

  // Retention
  if (plan.meeting_retention_months) {
    if (plan.meeting_retention_months >= 24) {
      features.push(`${Math.floor(plan.meeting_retention_months / 12)} year data retention`);
    } else {
      features.push(`${plan.meeting_retention_months} month data retention`);
    }
  } else {
    features.push('Unlimited data retention');
  }

  // Users - skip for pro plan (single user plan)
  if (plan.slug !== 'pro') {
    if (plan.max_users) {
      if (plan.slug === 'team') {
        features.push(`${plan.included_seats} users included`);
      } else {
        features.push(`${plan.max_users} user${plan.max_users > 1 ? 's' : ''}`);
      }
    } else {
      features.push('Unlimited users');
    }
  }

  // Plan-specific features
  if (plan.features) {
    if (plan.features.ai_summaries) features.push('AI meeting summaries');
    if (plan.features.analytics) features.push('Advanced analytics');
    if (plan.features.team_insights) features.push('Team insights & coaching');
    if (plan.features.api_access) features.push('API access');
    if (plan.features.custom_branding) features.push('Custom branding');
    if (plan.features.priority_support) features.push('Priority support');
    if (plan.features.integrations) features.push('CRM integrations');
  }

  return features;
}

export default PricingCard;

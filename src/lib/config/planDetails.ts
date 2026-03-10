// Plan comparison details for the billing page UI.
// Static data — not fetched from DB. Matches subscription_plans rows.

export interface PlanFeatureItem {
  name: string;
  value: string;
  included: boolean;
  highlight?: boolean;
}

export type PlanSlugConfig = 'free' | 'basic' | 'pro';

export interface PlanDetail {
  name: string;
  slug: PlanSlugConfig;
  monthlyPrice: number; // in pounds, not pence
  yearlyPrice: number;
  currency: string;
  tagline: string;
  badge?: string;
  ctaText: string;
  features: PlanFeatureItem[];
}

export const PLAN_DETAILS: Record<PlanSlugConfig, PlanDetail> = {
  free: {
    name: 'Free',
    slug: 'free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: '£',
    tagline: 'Try 60 free for 14 days',
    ctaText: 'Get Started Free',
    features: [
      { name: 'Monthly Credits', value: 'Complete set up for 100 free credits!', included: true },
      { name: 'AI Intelligence Tier', value: 'Up to Low', included: true },
      { name: 'Credit Rollover', value: 'None', included: false },
      { name: 'Call Recordings', value: '3 per month', included: true },
      { name: 'Call Recording Storage', value: '1 month', included: true },
      { name: 'Call Insights', value: '1 per month', included: true },
      { name: 'Dashboard & Analytics', value: 'Basic', included: true },
      { name: 'Notifications', value: 'Email only', included: true },
      { name: 'API & Webhooks', value: 'Not available', included: false },
    ],
  },
  basic: {
    name: 'Basic',
    slug: 'basic',
    monthlyPrice: 29,
    yearlyPrice: 290,
    currency: '£',
    tagline: 'For individuals and small teams getting started',
    ctaText: 'Upgrade to Basic',
    features: [
      { name: 'Monthly Credits', value: '30 free credits/month', included: true },
      { name: 'AI Intelligence Tier', value: 'Up to Medium', included: true },
      { name: 'Credit Rollover', value: '1 month', included: true },
      { name: 'Call Recordings', value: '20 per month', included: true },
      { name: 'Call Recording Storage', value: '6 months', included: true },
      { name: 'Call Insights', value: 'Unlimited', included: true },
      { name: 'Dashboard & Analytics', value: 'Advanced + coaching', included: true, highlight: true },
      { name: 'Notifications', value: 'Email and Slack', included: true },
      { name: 'API & Webhooks', value: 'Not available', included: false },
    ],
  },
  pro: {
    name: 'Pro',
    slug: 'pro',
    monthlyPrice: 99,
    yearlyPrice: 990,
    currency: '£',
    tagline: 'For power users and scaling teams',
    badge: 'Most Popular',
    ctaText: 'Upgrade to Pro',
    features: [
      { name: 'Monthly Credits', value: '120 free credits/month', included: true, highlight: true },
      { name: 'AI Intelligence Tier', value: 'Up to High', included: true, highlight: true },
      { name: 'Credit Rollover', value: '3 months', included: true, highlight: true },
      { name: 'Call Recordings', value: '200 per month', included: true },
      { name: 'Call Recording Storage', value: 'Unlimited', included: true, highlight: true },
      { name: 'Call Insights', value: 'Unlimited', included: true },
      { name: 'Dashboard & Analytics', value: 'Advanced + coaching', included: true },
      { name: 'Notifications', value: 'Email and Slack', included: true },
      { name: 'API & Webhooks', value: 'Full access', included: true, highlight: true },
    ],
  },
};

// Credit pack display data for billing page quick top-up
export const CREDIT_PACK_DISPLAY = [
  { packType: 'starter' as const, name: 'Signal', credits: 100, price: 49, perCredit: 0.49, tagline: 'Detect what matters' },
  { packType: 'growth' as const, name: 'Insight', credits: 250, price: 99, perCredit: 0.40, tagline: 'Connect the dots' },
  { packType: 'scale' as const, name: 'Intelligence', credits: 500, price: 149, perCredit: 0.30, tagline: 'Full AI autonomy' },
] as const;

// Annual savings calculation
export const ANNUAL_SAVINGS: Record<PlanSlugConfig, { monthly: number; annual: number; saved: number }> = {
  free: { monthly: 0, annual: 0, saved: 0 },
  basic: { monthly: 29 * 12, annual: 290, saved: 29 * 12 - 290 }, // £58
  pro: { monthly: 99 * 12, annual: 990, saved: 99 * 12 - 990 },   // £198
};

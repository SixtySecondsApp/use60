// Plan comparison details for the billing page UI.
// Static data — not fetched from DB. Matches subscription_plans rows.

export interface PlanFeatureItem {
  name: string;
  value: string;
  included: boolean;
  highlight?: boolean;
}

export interface PlanDetail {
  name: string;
  slug: 'basic' | 'pro';
  monthlyPrice: number; // in pounds, not pence
  yearlyPrice: number;
  currency: string;
  tagline: string;
  badge?: string;
  ctaText: string;
  features: PlanFeatureItem[];
}

export const PLAN_DETAILS: Record<'basic' | 'pro', PlanDetail> = {
  basic: {
    name: 'Basic',
    slug: 'basic',
    monthlyPrice: 29,
    yearlyPrice: 290,
    currency: '£',
    tagline: 'For individuals and small teams getting started',
    ctaText: 'Get Started',
    features: [
      { name: 'AI Intelligence Tier', value: 'Medium (default)', included: true },
      { name: 'Meeting Processing', value: 'Unlimited (Low free, Med/High use credits)', included: true },
      { name: 'Bundled Credits', value: 'None — purchase packs', included: false },
      { name: 'CRM Integration', value: 'HubSpot read/write', included: true },
      { name: 'AI Copilot', value: 'Available (uses credits)', included: true },
      { name: 'Calendar Integration', value: 'Full read/write', included: true },
      { name: 'Call Recording & Storage', value: 'Unlimited', included: true },
      { name: 'Slack Notifications', value: 'Included', included: true },
      { name: 'Dashboard & Analytics', value: 'Basic analytics', included: true },
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
      { name: 'AI Intelligence Tier', value: 'Medium (default)', included: true },
      { name: 'Meeting Processing', value: 'Unlimited (Low free, Med/High use credits)', included: true },
      { name: 'Bundled Credits', value: '250 credits/month (refresh monthly)', included: true, highlight: true },
      { name: 'CRM Integration', value: 'HubSpot read/write', included: true },
      { name: 'AI Copilot', value: 'Uses bundled credits first', included: true },
      { name: 'Calendar Integration', value: 'Full read/write', included: true },
      { name: 'Call Recording & Storage', value: 'Unlimited', included: true },
      { name: 'Slack Notifications', value: 'Included', included: true },
      { name: 'Dashboard & Analytics', value: 'Advanced analytics & coaching', included: true, highlight: true },
      { name: 'API & Webhooks', value: 'Full access', included: true, highlight: true },
    ],
  },
};

// Credit pack display data for billing page quick top-up
export const CREDIT_PACK_DISPLAY = [
  { packType: 'starter' as const, name: 'Signal', credits: 100, price: 49, perCredit: '£0.49', tagline: 'Detect what matters' },
  { packType: 'growth' as const, name: 'Insight', credits: 250, price: 99, perCredit: '£0.40', tagline: 'Connect the dots' },
  { packType: 'scale' as const, name: 'Intelligence', credits: 500, price: 149, perCredit: '£0.30', tagline: 'Full AI autonomy' },
] as const;

// Annual savings calculation
export const ANNUAL_SAVINGS = {
  basic: { monthly: 29 * 12, annual: 290, saved: 29 * 12 - 290 }, // £58
  pro: { monthly: 99 * 12, annual: 990, saved: 99 * 12 - 990 },   // £198
} as const;

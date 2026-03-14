/**
 * V23 Pricing Sections — Founding Member Lifetime Deal
 *
 * Sections:
 *   1. PricingSectionV23 — 3-plan grid (Basic, Pro Monthly, Founding Member)
 *   2. CostComparisonV23 — Interactive savings calculator
 *   3. HowBYOKWorksV23 — 3-step API key explainer
 *   4. CreditPacksPreviewV23 — Add-on credit packs for integrations
 *   5. PricingFAQV23 — Pricing-specific FAQ accordion
 *
 * Rules:
 *   - Founding Member is for NEW users only (not free trial converts)
 *   - 30-day money-back guarantee
 *   - BYOK: user adds their own Claude API key (no AI margin)
 *   - Integration actions (Apollo, AI Ark, HeyGen) still require credit packs
 *   - Scarcity counter: "X of 100 spots claimed"
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  ArrowRight, Check, X as XIcon, Crown, Zap, Key,
  ShieldCheck, Clock, CreditCard, Sparkles, ChevronDown,
  Search, Mail, BarChart3, Users, Lock, Shield, FileText,
  Settings, DollarSign, TrendingUp, RefreshCw, Calendar,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── Currency Detection ───────────────────────────────────────

export type Currency = 'USD' | 'GBP' | 'EUR';

const CURRENCY_SYMBOLS: Record<Currency, string> = { USD: '$', GBP: '\u00A3', EUR: '\u20AC' };

/**
 * Detect currency from browser timezone/locale.
 * Falls back to USD. No external API call needed.
 */
export function detectCurrency(): Currency {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const locale = navigator.language || '';

    // UK
    if (tz.startsWith('Europe/London') || tz.startsWith('Europe/Belfast') || locale.startsWith('en-GB')) return 'GBP';

    // EU timezones
    const euZones = ['Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam', 'Europe/Brussels',
      'Europe/Rome', 'Europe/Madrid', 'Europe/Lisbon', 'Europe/Vienna', 'Europe/Dublin',
      'Europe/Helsinki', 'Europe/Stockholm', 'Europe/Copenhagen', 'Europe/Oslo',
      'Europe/Warsaw', 'Europe/Prague', 'Europe/Budapest', 'Europe/Bucharest',
      'Europe/Athens', 'Europe/Zurich'];
    if (euZones.some(z => tz.startsWith(z))) return 'EUR';

    // EU locales
    const euLocales = ['de', 'fr', 'es', 'it', 'nl', 'pt', 'pl', 'sv', 'da', 'fi', 'nb', 'nn', 'el', 'cs', 'hu', 'ro', 'bg', 'hr', 'sk', 'sl', 'et', 'lv', 'lt', 'mt', 'ga'];
    const lang = locale.split('-')[0];
    if (euLocales.includes(lang)) return 'EUR';
  } catch {
    // Intl not available
  }
  return 'USD';
}

// Plan prices by currency
const PLAN_PRICES: Record<string, Record<Currency, { monthly: number; yearly: number; lifetime: number }>> = {
  basic: { USD: { monthly: 29, yearly: 290, lifetime: 0 }, GBP: { monthly: 23, yearly: 230, lifetime: 0 }, EUR: { monthly: 27, yearly: 270, lifetime: 0 } },
  pro:   { USD: { monthly: 99, yearly: 990, lifetime: 0 }, GBP: { monthly: 79, yearly: 790, lifetime: 0 }, EUR: { monthly: 92, yearly: 920, lifetime: 0 } },
  founding: { USD: { monthly: 0, yearly: 0, lifetime: 299 }, GBP: { monthly: 0, yearly: 0, lifetime: 239 }, EUR: { monthly: 0, yearly: 0, lifetime: 279 } },
};

// ─── Animation ────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)', scale: 0.98 },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', scale: 1, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

// ═══════════════════════════════════════════════════════════════
//  1. PRICING SECTION — 3-plan grid
// ═══════════════════════════════════════════════════════════════

const FOUNDING_MEMBER_TOTAL = 100;
const FOUNDING_MEMBER_CLAIMED = 47;

interface PlanFeature {
  text: string;
  included: boolean;
  highlight?: boolean;
}

interface PricingPlan {
  name: string;
  slug: string;
  badge?: string;
  priceSuffix: string;
  priceNote?: string;
  description: string;
  features: PlanFeature[];
  cta: string;
  ctaUrl: string;
  highlighted?: boolean;
  foundingMember?: boolean;
}

const PLANS: PricingPlan[] = [
  {
    name: 'Basic',
    slug: 'basic',
    priceSuffix: '/mo',
    description: 'For solo founders getting started with AI-powered sales.',
    features: [
      { text: 'Calendar & email sync', included: true },
      { text: 'Slack notifications', included: true },
      { text: 'Basic analytics', included: true },
      { text: 'Up to 2 users', included: true },
      { text: 'Community support', included: true },
      { text: 'AI copilot (credit packs)', included: true },
      { text: 'API access', included: false },
      { text: 'Advanced analytics', included: false },
      { text: 'Priority support', included: false },
      { text: 'Bring your own API key', included: false },
    ],
    cta: 'Start Free Trial',
    ctaUrl: 'https://app.use60.com/auth/signup',
  },
  {
    name: 'Founding Member',
    slug: 'founding',
    badge: 'Lifetime Deal',
    priceSuffix: ' once',
    priceNote: 'Pay once, use forever',
    description: 'Full platform access for life. 500 credits to get started. You bring your API key, you control your AI costs.',
    foundingMember: true,
    highlighted: true,
    features: [
      { text: 'Lifetime platform access \u2014 no subscription ever', included: true, highlight: true },
      { text: '500 welcome credits included (Intelligence pack)', included: true, highlight: true },
      { text: 'Bring your own Claude API key \u2014 zero markup', included: true, highlight: true },
      { text: 'All Pro features included', included: true, highlight: true },
      { text: 'Founding Member badge (visible in-app)', included: true, highlight: true },
      { text: 'Private Slack community for founders', included: true, highlight: true },
      { text: 'Early access to new features', included: true, highlight: true },
      { text: 'Locked-in credit pack pricing for life', included: true },
      { text: 'Quarterly roadmap input & voting', included: true },
      { text: 'Unlimited users (each adds their own key)', included: true },
      { text: 'API access, webhooks & advanced analytics', included: true },
      { text: '30-day money-back guarantee', included: true, highlight: true },
    ],
    // New-users gate is enforced server-side in create-founding-checkout edge function.
    // It rejects with 403 if the org already has ANY organization_subscriptions row
    // (including trials). No frontend auth check needed — this is a public landing page.
    cta: 'Claim Your Spot',
    ctaUrl: 'https://app.use60.com/auth/signup?plan=founding',
  },
  {
    name: 'Pro',
    slug: 'pro',
    badge: 'Monthly',
    priceSuffix: '/mo',
    priceNote: '250 credits included each month',
    description: 'Full power for growing teams. AI costs covered by us.',
    features: [
      { text: 'Everything in Basic', included: true },
      { text: '250 credits/month included', included: true },
      { text: 'AI copilot (all tiers)', included: true },
      { text: 'API access & webhooks', included: true },
      { text: 'Advanced analytics & coaching', included: true },
      { text: 'Up to 15 users', included: true },
      { text: 'Priority support', included: true },
      { text: 'Custom integrations', included: true },
      { text: 'Bring your own API key', included: false },
      { text: 'Lifetime access', included: false },
    ],
    cta: 'Start Free Trial',
    ctaUrl: 'https://app.use60.com/auth/signup',
  },
];

function getPlanPrice(slug: string, currency: Currency): string {
  const prices = PLAN_PRICES[slug];
  if (!prices) return '';
  const p = prices[currency];
  const sym = CURRENCY_SYMBOLS[currency];
  if (slug === 'founding') return `${sym}${p.lifetime}`;
  return `${sym}${p.monthly}`;
}

function getPlanPriceNote(slug: string, currency: Currency): string | undefined {
  if (slug === 'founding') return 'Pay once, use forever';
  if (slug === 'pro') return '250 credits included each month';
  return undefined;
}

function getFoundingCountUrl(): string {
  const isLocal = typeof window !== 'undefined' && window.location.hostname.includes('localhost');
  const ref = isLocal ? 'caerqjzvuerejfrdtygb' : 'ygdpgliavpxeugaajgrb';
  return `https://${ref}.supabase.co/functions/v1/get-founding-count`;
}

function ScarcityCounter() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);
  const [claimed, setClaimed] = useState(FOUNDING_MEMBER_CLAIMED);
  const [total, setTotal] = useState(FOUNDING_MEMBER_TOTAL);
  const percentage = (claimed / total) * 100;

  // Fetch live count — non-blocking, falls back to constants
  useEffect(() => {
    fetch(getFoundingCountUrl())
      .then((r) => r.json())
      .then((d: { claimed: number; total: number }) => {
        if (d.claimed != null) setClaimed(d.claimed);
        if (d.total != null) setTotal(d.total);
      })
      .catch(() => {/* keep fallback defaults */});
  }, []);

  useEffect(() => {
    if (!isInView) return;
    let frame: number;
    const start = performance.now();
    const duration = 1500;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(eased * claimed));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isInView, claimed]);

  return (
    <div ref={ref} className="mt-4">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-amber-600 dark:text-amber-400 font-semibold">
          {count} of {total} spots claimed
        </span>
        <span className="text-gray-400 dark:text-gray-500">{total - claimed} left</span>
      </div>
      <div className="h-2 rounded-full bg-gray-200 dark:bg-white/[0.06] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={isInView ? { width: `${percentage}%` } : {}}
          transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 dark:from-amber-400 dark:to-orange-500"
        />
      </div>
    </div>
  );
}

function PlanCard({ plan, currency }: { plan: PricingPlan; currency: Currency }) {
  const price = getPlanPrice(plan.slug, currency);

  return (
    <motion.div
      variants={fadeUp}
      className={`relative rounded-2xl border p-6 md:p-8 flex flex-col transition-all ${
        plan.highlighted
          ? 'bg-white dark:bg-white/[0.06] border-blue-300 dark:border-[#37bd7e]/40 shadow-xl shadow-blue-500/10 dark:shadow-[#37bd7e]/10 ring-1 ring-blue-500/20 dark:ring-[#37bd7e]/20 scale-[1.02] z-10'
          : 'bg-white dark:bg-white/[0.02] border-gray-200 dark:border-white/[0.06]'
      }`}
    >
      {/* Badge */}
      {plan.badge && (
        <div className={`absolute -top-3 left-6 px-3 py-1 rounded-full text-xs font-bold ${
          plan.foundingMember
            ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/20'
            : 'bg-blue-500 dark:bg-[#37bd7e] text-white'
        }`}>
          {plan.badge}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h3 className="font-display font-bold text-xl text-gray-900 dark:text-white mb-2">{plan.name}</h3>
        <div className="flex items-baseline gap-1">
          <span className={`font-display font-extrabold text-4xl md:text-5xl ${
            plan.highlighted ? 'text-blue-600 dark:text-[#37bd7e]' : 'text-gray-900 dark:text-white'
          }`}>{price}</span>
          <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">{plan.priceSuffix}</span>
        </div>
        {plan.priceNote && (
          <p className={`text-xs mt-1 ${
            plan.foundingMember ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-500 dark:text-gray-400'
          }`}>{plan.priceNote}</p>
        )}
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-3 leading-relaxed">{plan.description}</p>
      </div>

      {/* Scarcity counter for founding member */}
      {plan.foundingMember && <ScarcityCounter />}

      {/* Features */}
      <ul className="space-y-2.5 my-6 flex-1">
        {plan.features.map((f) => (
          <li key={f.text} className="flex items-start gap-2.5">
            {f.included ? (
              <Check className={`w-4 h-4 shrink-0 mt-0.5 ${
                f.highlight ? 'text-amber-500 dark:text-amber-400' : 'text-blue-500 dark:text-[#37bd7e]'
              }`} />
            ) : (
              <XIcon className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0 mt-0.5" />
            )}
            <span className={`text-sm ${
              f.included
                ? f.highlight
                  ? 'text-gray-900 dark:text-white font-medium'
                  : 'text-gray-700 dark:text-gray-300'
                : 'text-gray-400 dark:text-gray-500'
            }`}>{f.text}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <a
        href={plan.ctaUrl}
        className={`w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold transition-all hover:translate-y-[-1px] ${
          plan.highlighted
            ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white hover:shadow-lg hover:shadow-amber-500/25 dark:hover:shadow-orange-500/25'
            : 'bg-blue-500 text-white hover:bg-blue-600 dark:bg-[#37bd7e] dark:hover:bg-[#2ea86d] hover:shadow-lg hover:shadow-blue-500/20 dark:hover:shadow-[#37bd7e]/20'
        }`}
      >
        {plan.foundingMember && <Crown className="w-4 h-4" />}
        {plan.cta}
        <ArrowRight className="w-4 h-4" />
      </a>

      {/* Money-back guarantee */}
      {plan.foundingMember && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-xs text-gray-500 dark:text-gray-400">30-day money-back guarantee</span>
        </div>
      )}

      {/* New users only note */}
      {plan.foundingMember && (
        <p className="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-2">
          Available to new users only — not applicable after free trial
        </p>
      )}
    </motion.div>
  );
}

const CURRENCY_OPTIONS: { value: Currency; label: string; flag: string }[] = [
  { value: 'USD', label: 'USD', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
  { value: 'GBP', label: 'GBP', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
  { value: 'EUR', label: 'EUR', flag: '\uD83C\uDDEA\uD83C\uDDFA' },
];

export function PricingSectionV23({ currency, onCurrencyChange }: { currency: Currency; onCurrencyChange: (c: Currency) => void }) {
  return (
    <section id="pricing" className="bg-gray-50 dark:bg-[#0a1020] py-16 md:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
            <Crown className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Founding Member Offer \u2014 Limited to 100 spots</span>
          </div>
          <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-white tracking-tight">
            Pay once. Use forever.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            Bring your own API key. 500 credits to get started. Keep the full platform for life.
          </p>

          {/* Currency toggle */}
          <div className="mt-6 inline-flex items-center gap-1 p-1 rounded-lg bg-gray-100 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06]">
            {CURRENCY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onCurrencyChange(opt.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  currency === opt.value
                    ? 'bg-white dark:bg-white/[0.08] text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {opt.flag} {opt.label}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4 items-start">
          {PLANS.map((plan) => (
            <PlanCard key={plan.slug} plan={plan} currency={currency} />
          ))}
        </motion.div>

        {/* What's included vs what costs credits */}
        <FoundingMemberBreakdown />
      </div>
    </section>
  );
}

// ─── Founding Member: Included vs Credits breakdown ──────────

const INCLUDED_ITEMS = [
  { icon: Sparkles, text: 'AI copilot chat (all tiers)' },
  { icon: BarChart3, text: 'Meeting analysis & summaries' },
  { icon: Mail, text: 'Follow-up email drafting' },
  { icon: FileText, text: 'Proposal generation' },
  { icon: TrendingUp, text: 'Pipeline health scoring' },
  { icon: Calendar, text: 'Meeting prep briefs' },
  { icon: Users, text: 'Founding Member Slack community' },
  { icon: Crown, text: 'In-app Founding Member badge' },
  { icon: RefreshCw, text: 'Early access to new features' },
  { icon: Lock, text: 'Locked-in credit pricing for life' },
];

const CREDITS_ITEMS = [
  { icon: Search, text: 'Apollo contact searches' },
  { icon: BarChart3, text: 'AI Ark company & people lookups' },
  { icon: Mail, text: 'Instantly email sends' },
  { icon: Users, text: 'HeyGen video avatars' },
  { icon: DollarSign, text: 'ElevenLabs voice cloning' },
];

function FoundingMemberBreakdown() {
  return (
    <motion.div
      variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
      className="mt-12 rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-6 md:p-8"
    >
      <h3 className="font-display font-bold text-xl text-gray-900 dark:text-white text-center mb-8">
        Founding Member: what&apos;s included vs what uses credits
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
        {/* Included — powered by your API key */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <h4 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Included — powered by your API key
            </h4>
          </div>
          <div className="space-y-2">
            {INCLUDED_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.text} className="flex items-center gap-2.5 py-1.5">
                  <Icon className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{item.text}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
            All AI features run through your Claude API key. You pay Anthropic directly at their published rates \u2014 typically $5\u201320/month for a solo founder.
          </p>
        </div>

        {/* Credits required — third-party integrations */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-blue-500/15 flex items-center justify-center">
              <CreditCard className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              Top up as you go — credit packs
            </h4>
          </div>
          <div className="space-y-2">
            {CREDITS_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.text} className="flex items-center gap-2.5 py-1.5">
                  <Icon className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{item.text}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
            You get 500 welcome credits to try everything. After that, top up with credit packs when you need them \u2014 no subscription, no expiry, locked-in pricing.
          </p>

          <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/[0.04] border border-amber-200 dark:border-amber-500/15">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <span className="font-semibold">500 credits go a long way</span> \u2014 that&apos;s ~1,600 Apollo searches, or 60 meeting summaries, or a mix of everything.
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  2. COST COMPARISON — Interactive savings calculator
// ═══════════════════════════════════════════════════════════════

const MONTHS = [3, 6, 12, 24];

export function CostComparisonV23({ currency }: { currency: Currency }) {
  const [months, setMonths] = useState(12);
  const sym = CURRENCY_SYMBOLS[currency];
  const proMonthly = PLAN_PRICES.pro[currency].monthly;
  const foundingCost = PLAN_PRICES.founding[currency].lifetime;
  const proCost = months * proMonthly;
  const savings = proCost - foundingCost;
  const savingsPercent = Math.round((savings / proCost) * 100);

  return (
    <section className="bg-white dark:bg-[#070b18] py-14 md:py-20">
      <div className="max-w-4xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-10">
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-400 mb-4 tracking-wide uppercase">The math</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            It pays for itself in 3 months
          </h2>
        </motion.div>

        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-6 md:p-8">

          {/* Month selector */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Show savings over</span>
            {MONTHS.map((m) => (
              <button
                key={m}
                onClick={() => setMonths(m)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  months === m
                    ? 'bg-blue-500 dark:bg-[#37bd7e] text-white shadow-sm'
                    : 'bg-white dark:bg-white/[0.04] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-white/[0.06] hover:border-gray-300 dark:hover:border-white/[0.1]'
                }`}
              >
                {m}mo
              </button>
            ))}
          </div>

          {/* Comparison bars */}
          <div className="space-y-4">
            {/* Pro monthly */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Pro Monthly</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{sym}{proCost.toLocaleString()}</span>
              </div>
              <div className="h-10 rounded-lg bg-gray-200 dark:bg-white/[0.06] overflow-hidden">
                <motion.div
                  key={months}
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-lg bg-gray-400 dark:bg-gray-500 flex items-center justify-end pr-3"
                >
                  <span className="text-xs font-bold text-white">{sym}{proCost}</span>
                </motion.div>
              </div>
            </div>

            {/* Founding member */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Founding Member (Lifetime)</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{sym}{foundingCost}</span>
              </div>
              <div className="h-10 rounded-lg bg-gray-200 dark:bg-white/[0.06] overflow-hidden">
                <motion.div
                  key={months}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max((foundingCost / proCost) * 100, 8)}%` }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                  className="h-full rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-500 dark:from-[#37bd7e] dark:to-emerald-400 flex items-center justify-end pr-3"
                >
                  <span className="text-xs font-bold text-white">{sym}{foundingCost}</span>
                </motion.div>
              </div>
            </div>
          </div>

          {/* Savings callout */}
          <motion.div
            key={months}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className={`mt-6 p-4 rounded-xl text-center ${
              savings > 0
                ? 'bg-emerald-50 dark:bg-emerald-500/[0.06] border border-emerald-200 dark:border-emerald-500/20'
                : 'bg-blue-50 dark:bg-blue-500/[0.06] border border-blue-200 dark:border-blue-500/20'
            }`}
          >
            {savings > 0 ? (
              <>
                <p className="text-2xl md:text-3xl font-display font-bold text-emerald-600 dark:text-emerald-400">
                  You save {sym}{savings.toLocaleString()}
                </p>
                <p className="text-sm text-emerald-600/70 dark:text-emerald-400/70 mt-1">
                  That&apos;s {savingsPercent}% less over {months} months — plus 500 credits included free
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl md:text-3xl font-display font-bold text-blue-600 dark:text-blue-400">
                  Pays for itself right here
                </p>
                <p className="text-sm text-blue-600/70 dark:text-blue-400/70 mt-1">
                  Same cost as {months} months of Pro — but yours is forever, plus 500 credits included free
                </p>
              </>
            )}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  3. HOW BYOK WORKS — 3-step explainer
// ═══════════════════════════════════════════════════════════════

const BYOK_STEPS = [
  {
    step: 1,
    icon: Key,
    title: 'Get your API key',
    description: 'Create an Anthropic account and generate a Claude API key. Takes 2 minutes.',
    detail: 'You only pay Anthropic for what you actually use — no markup, no middleman.',
  },
  {
    step: 2,
    icon: Settings,
    title: 'Paste it into 60',
    description: 'Go to Settings, paste your key. 60 stores it securely (256-bit encryption).',
    detail: 'Your key is never exposed to the browser. It lives server-side, encrypted at rest.',
  },
  {
    step: 3,
    icon: Sparkles,
    title: 'Use the full platform',
    description: 'AI copilot, meeting analysis, follow-ups, proposals — all powered by your key.',
    detail: 'You control your spend directly with Anthropic. Typical cost: $5-20/month for a solo founder.',
  },
];

export function HowBYOKWorksV23() {
  return (
    <section className="bg-gray-50 dark:bg-[#0a1020] py-14 md:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-12">
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-400 mb-4 tracking-wide uppercase">Bring your own key</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            Your key. Your costs. Zero markup.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            Most platforms charge 3-10x on AI costs. With 60, you pay Anthropic directly at their published rates.
          </p>
        </motion.div>

        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {BYOK_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <motion.div key={step.step} variants={fadeUp}
                className="relative bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] rounded-xl p-6
                  hover:shadow-lg hover:border-gray-300 dark:hover:border-white/[0.1] transition-all">
                {/* Step number */}
                <div className="absolute -top-3 left-6 w-7 h-7 rounded-full bg-blue-500 dark:bg-[#37bd7e] flex items-center justify-center">
                  <span className="text-xs font-bold text-white">{step.step}</span>
                </div>

                <div className="mt-2">
                  <div className="w-12 h-12 bg-blue-500/10 dark:bg-[#37bd7e]/10 rounded-xl flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-blue-500 dark:text-[#37bd7e]" />
                  </div>
                  <h3 className="font-display font-bold text-lg text-gray-900 dark:text-white mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 leading-relaxed">{step.description}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">{step.detail}</p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Cost comparison callout */}
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="mt-8 p-5 rounded-xl bg-blue-50 dark:bg-blue-500/[0.04] border border-blue-200 dark:border-blue-500/15 flex flex-col sm:flex-row items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-500/15 dark:bg-blue-500/20 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5 text-blue-500 dark:text-blue-400" />
          </div>
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Typical AI cost with your own key: $5-20/month</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Based on a solo founder using copilot chat, meeting summaries, and follow-up drafting daily</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  4. CREDIT PACKS PREVIEW — Add-on for integrations
// ═══════════════════════════════════════════════════════════════

const CREDIT_PACKS_DATA = [
  { name: 'Signal', tagline: 'Detect what matters', credits: 100, gbp: 15, usd: 19, eur: 17, popular: false },
  { name: 'Insight', tagline: 'Connect the dots', credits: 250, gbp: 30, usd: 38, eur: 35, popular: true },
  { name: 'Intelligence', tagline: 'Full AI autonomy', credits: 500, gbp: 50, usd: 63, eur: 58, popular: false },
];

const CREDIT_EXAMPLES = [
  { action: 'Apollo contact search', cost: '0.3 credits', icon: Search },
  { action: 'Send email via Instantly', cost: '0.1 credits', icon: Mail },
  { action: 'AI Ark company lookup', cost: '0.25 credits', icon: BarChart3 },
  { action: 'AI Ark people search', cost: '1.25 credits', icon: Users },
];

function formatPackPrice(pack: typeof CREDIT_PACKS_DATA[number], currency: Currency) {
  const { symbol, price } = getCurrencyPrice(pack, currency);
  const perCredit = (price / pack.credits).toFixed(2);
  return { display: `${symbol}${price}`, perCredit: `${symbol}${perCredit}` };
}

function getCurrencyPrice(pack: { gbp: number; usd: number; eur: number }, currency: Currency) {
  switch (currency) {
    case 'GBP': return { symbol: '\u00A3', price: pack.gbp };
    case 'EUR': return { symbol: '\u20AC', price: pack.eur };
    default: return { symbol: '$', price: pack.usd };
  }
}

export function CreditPacksPreviewV23({ currency }: { currency: Currency }) {
  return (
    <section className="bg-white dark:bg-[#070b18] py-14 md:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-10">
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-400 mb-4 tracking-wide uppercase">Add-on credit packs</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            Integration actions run on credits
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            Your API key powers the AI. Credits cover third-party integrations like Apollo, AI Ark, and Instantly. Buy what you need.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {/* Credit packs */}
          <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Packs</h3>
            <div className="space-y-3">
              {CREDIT_PACKS_DATA.map((pack) => {
                const { display, perCredit } = formatPackPrice(pack, currency);
                return (
                  <div key={pack.name}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                      pack.popular
                        ? 'bg-blue-50 dark:bg-blue-500/[0.04] border-blue-200 dark:border-blue-500/20'
                        : 'bg-gray-50 dark:bg-white/[0.02] border-gray-200 dark:border-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        pack.popular ? 'bg-blue-500/15 dark:bg-blue-500/20' : 'bg-gray-100 dark:bg-white/[0.04]'
                      }`}>
                        <CreditCard className={`w-5 h-5 ${pack.popular ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{pack.name}</p>
                          {pack.popular && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500 dark:bg-[#37bd7e] text-white font-bold">Popular</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{pack.credits} credits · {perCredit}/credit</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">{pack.tagline}</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{display}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* What costs credits */}
          <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">What uses credits</h3>
            <div className="space-y-3">
              {CREDIT_EXAMPLES.map((ex) => {
                const Icon = ex.icon;
                return (
                  <div key={ex.action}
                    className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.06]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/[0.04] flex items-center justify-center">
                        <Icon className="w-4 h-4 text-gray-400" />
                      </div>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{ex.action}</span>
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums">{ex.cost}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/[0.04] border border-emerald-200 dark:border-emerald-500/15">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  <span className="font-semibold">AI features use your API key</span> — copilot, meeting analysis, follow-ups, and proposals cost zero credits
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  5. PRICING FAQ — Pricing-specific questions
// ═══════════════════════════════════════════════════════════════

const PRICING_FAQ = [
  {
    question: 'What exactly is "Bring Your Own Key"?',
    answer: 'Instead of us charging you for AI usage, you create your own API key with Anthropic (the company behind Claude) and paste it into 60. All AI features \u2014 copilot, meeting summaries, follow-ups, proposals \u2014 run through your key. You pay Anthropic directly at their published rates with zero markup from us.',
  },
  {
    question: 'How much does the Anthropic API cost?',
    answer: 'Most solo founders spend $5\u201320/month on API costs. Claude 3.5 Sonnet (the model 60 uses) costs roughly $3 per million input tokens and $15 per million output tokens. A typical meeting summary uses about 2\u00A2 worth of tokens. It\u2019s dramatically cheaper than paying a SaaS platform\u2019s AI markup.',
  },
  {
    question: 'Can I switch from the Founding Member deal to Pro later?',
    answer: 'You won\u2019t need to \u2014 Founding Member includes everything in Pro. But if you want us to manage AI costs for you instead of BYOK, you can switch to Pro Monthly at any time. Your lifetime access stays active either way.',
  },
  {
    question: 'What\u2019s the difference between credits and API key usage?',
    answer: 'Your API key powers AI features (copilot chat, meeting analysis, follow-up drafting, proposals). Credits are for third-party integration actions \u2014 things like Apollo contact searches, AI Ark lookups, and Instantly email sends. These have real per-call costs that we pass through at cost via credit packs.',
  },
  {
    question: 'Is the Founding Member deal available to everyone?',
    answer: 'Only to new users who haven\u2019t started a free trial. Once you\u2019ve used a free trial, the offer is no longer available. We\u2019re limiting it to 100 spots total \u2014 once they\u2019re gone, the only option is the monthly plans.',
  },
  {
    question: 'What if I\u2019m not happy? Can I get a refund?',
    answer: 'Yes \u2014 100% money-back guarantee within 30 days, no questions asked. If 60 isn\u2019t for you, email us and we\u2019ll refund you immediately.',
  },
];

export function PricingFAQV23() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="bg-gray-50 dark:bg-[#0a1020] py-14 md:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-12">
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-400 mb-4 tracking-wide uppercase">Pricing FAQ</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            Questions about pricing
          </h2>
        </motion.div>

        <div className="space-y-3">
          {PRICING_FAQ.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-gray-900 dark:text-white pr-4">{item.question}</span>
                  <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0">
                    <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.answer}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

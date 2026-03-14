/**
 * V22 Premium Sections — 11 improvements over V21
 *
 * New sections:
 *   #2  IntegrationMarqueeV22 — Auto-scrolling logo strip
 *   #3  StickyCTABar — Fixed bar below navbar
 *   #4  BeforeAfterV22 — "Without 60" vs "With 60" comparison
 *   #5  FAQV22 — Accordion
 *   #8  ComparisonTableV22 — "60 vs 5 tools"
 *
 * Modified sections:
 *   #6  CredibilityBarV22 — Animated count-up on scroll
 *   #7  CTAV22 — Trust badges below CTA
 *   #9  TestimonialsV22 — Mobile drag carousel
 *   #10 WhoItsForV22 — Persona deep links
 *   #10 BenefitsV22 — Accepts jumpToIndex prop
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  ArrowRight, Check, Star, Rocket, Users, Building2,
  Clock, TrendingUp, Zap, DollarSign, Mail, Calendar,
  BarChart3, Search, Activity, ChevronDown,
  ShieldCheck, Lock, Shield,
  FileText, Target, Play, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
//  #6 CREDIBILITY BAR — Animated count-up on scroll
// ═══════════════════════════════════════════════════════════════

const CREDIBILITY_STATS = [
  { icon: Clock, value: 10, suffix: ' years', label: 'of GTM expertise' },
  { icon: Users, value: 200, suffix: '+', label: 'clients served' },
  { icon: DollarSign, value: 500, suffix: 'M+', label: 'pipeline generated' },
  { icon: TrendingUp, value: 40, suffix: '%', label: 'avg close rate lift' },
];

function CredibilityCountUp({ target, isInView: visible }: { target: number; isInView: boolean }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let frame: number;
    const start = performance.now();
    const duration = 2000;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(eased * target));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, target]);
  return <>{count}</>;
}

export function CredibilityBarV22() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <section className="bg-gray-50 dark:bg-[#070b18] py-12 md:py-16 border-b border-gray-200 dark:border-white/[0.04]">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-5xl mx-auto px-6"
      >
        <p className="text-center text-base md:text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
          Built by the team behind{' '}
          <span className="text-blue-600 dark:text-[#37bd7e] font-semibold">Sixty Seconds</span>
        </p>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-10 max-w-xl mx-auto">
          10 years running go-to-market for 200+ companies. We built the tool we wished we had.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {CREDIBILITY_STATS.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="text-center"
              >
                <div className="flex justify-center mb-2">
                  <div className="w-9 h-9 bg-blue-500/10 dark:bg-[#37bd7e]/10 rounded-lg flex items-center justify-center">
                    <Icon className="w-4 h-4 text-blue-500 dark:text-[#37bd7e]" />
                  </div>
                </div>
                <p className="text-2xl md:text-3xl font-display font-bold text-gray-900 dark:text-white tabular-nums">
                  <CredibilityCountUp target={stat.value} isInView={isInView} /><span className="text-blue-500 dark:text-[#37bd7e]">{stat.suffix}</span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stat.label}</p>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  #2 INTEGRATION MARQUEE — Auto-scrolling logo strip
// ═══════════════════════════════════════════════════════════════

const MARQUEE_INTEGRATIONS = [
  { name: 'HubSpot', domain: 'hubspot.com' },
  { name: 'Attio', domain: 'attio.com' },
  { name: 'Bullhorn', domain: 'bullhorn.com' },
  { name: 'Slack', domain: 'slack.com' },
  { name: 'Google Workspace', domain: 'google.com' },
  { name: 'Outlook', domain: 'outlook.com' },
  { name: 'Fathom', domain: 'fathom.video' },
  { name: 'Apollo', domain: 'apollo.io' },
  { name: 'AI Ark', domain: 'ai-ark.com' },
  { name: 'Explorium', domain: 'explorium.ai' },
  { name: 'Apify', domain: 'apify.com' },
  { name: 'Instantly', domain: 'instantly.ai' },
  { name: 'LinkedIn', domain: 'linkedin.com' },
  { name: 'Stripe', domain: 'stripe.com' },
  { name: 'JustCall', domain: 'justcall.io' },
  { name: 'Better Contact', domain: 'bettercontact.rocks' },
  { name: 'HeyReach', domain: 'heyreach.io' },
  { name: 'Salesforce', domain: 'salesforce.com' },
];

const LOGO_OVERRIDES: Record<string, string> = {
  'outlook.com': 'https://cdn-dynmedia-1.microsoft.com/is/image/microsoftcorp/Outlook-m365-apps?fmt=png-alpha&wid=128',
};

function MarqueeLogo({ domain, name }: { domain: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const url = LOGO_OVERRIDES[domain] || `https://img.logo.dev/${domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=128&format=png`;

  return (
    <div className="flex items-center gap-2.5 px-5 shrink-0">
      <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center shrink-0">
        {!errored ? (
          <img src={url} alt={`${name} logo`} width={32} height={32}
            className={`w-full h-full object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setLoaded(true)} onError={() => setErrored(true)} loading="lazy" />
        ) : (
          <span className="text-xs font-bold text-gray-500">{name.charAt(0)}</span>
        )}
      </div>
      <span className="text-sm font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{name}</span>
    </div>
  );
}

export function IntegrationMarqueeV22() {
  return (
    <section className="bg-gray-50 dark:bg-[#070b18] py-6 border-b border-gray-200 dark:border-white/[0.04] overflow-hidden">
      <p className="text-center text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
        Integrates with your stack
      </p>
      <div className="relative group">
        {/* Gradient edge masks */}
        <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-gray-50 dark:from-[#070b18] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-gray-50 dark:from-[#070b18] to-transparent z-10 pointer-events-none" />

        {/* Scrolling strip — duplicated for seamless loop */}
        <div className="flex animate-marquee group-hover:[animation-play-state:paused]">
          {[...MARQUEE_INTEGRATIONS, ...MARQUEE_INTEGRATIONS].map((integration, i) => (
            <MarqueeLogo key={`${integration.name}-${i}`} domain={integration.domain} name={integration.name} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  #3 STICKY CTA BAR — Fixed below navbar
// ═══════════════════════════════════════════════════════════════

export function StickyCTABar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      const docHeight = document.documentElement.scrollHeight;
      const viewHeight = window.innerHeight;
      const nearBottom = y + viewHeight > docHeight - 400;
      setVisible(y > 700 && !nearBottom);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      className={`fixed top-16 left-0 right-0 z-40 transition-transform duration-300 ${
        visible ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div className="bg-white/95 dark:bg-[#0a1020]/95 backdrop-blur-md border-b border-gray-200 dark:border-white/[0.06] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between">
          <span className="hidden sm:block text-sm font-semibold text-gray-700 dark:text-gray-300">
            Your AI sales team is ready
          </span>
          <a
            href="https://app.use60.com/auth/signup"
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold
              bg-blue-500 text-white hover:bg-blue-600 dark:bg-[#37bd7e] dark:hover:bg-[#2ea86d]
              transition-all hover:shadow-md sm:ml-auto"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  #10 WHO IT'S FOR — Persona deep links
// ═══════════════════════════════════════════════════════════════

interface Persona {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  pain: string;
  solution: string;
  stat: string;
  benefitIndex: number;
}

const PERSONAS: Persona[] = [
  {
    icon: Rocket,
    title: 'Solo Founders',
    subtitle: 'Seed to Series A',
    pain: 'Too busy building product to follow up on leads.',
    solution: '60 handles prospecting, follow-ups, and meeting prep — so you focus on closing.',
    stat: 'Save 15+ hrs/week',
    benefitIndex: 0,
  },
  {
    icon: Users,
    title: 'Small Sales Teams',
    subtitle: '2\u201315 reps',
    pain: 'Everyone sells, nobody follows up consistently.',
    solution: '60 gives every rep enterprise-grade automation without enterprise-grade complexity.',
    stat: '94% follow-up rate',
    benefitIndex: 2,
  },
  {
    icon: Building2,
    title: 'Agencies & Consultancies',
    subtitle: 'Managing 10+ client accounts',
    pain: '20 clients, 100 deals, one person tracking it all.',
    solution: '60 orchestrates your whole pipeline so nothing slips between client accounts.',
    stat: '3x pipeline coverage',
    benefitIndex: 5,
  },
];

export function WhoItsForV22({ onPersonaClick }: { onPersonaClick?: (benefitIndex: number) => void }) {
  return (
    <section className="bg-white dark:bg-[#070b18] py-14 md:py-20">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-14">
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-400 mb-4 tracking-wide uppercase">Who it&apos;s for</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            Built for teams that sell, not teams that admin
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            Whether you&apos;re a solo founder or a growing team, 60 adapts to how you work.
          </p>
        </motion.div>

        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PERSONAS.map((persona) => {
            const Icon = persona.icon;
            return (
              <motion.div key={persona.title} variants={fadeUp}
                onClick={() => onPersonaClick?.(persona.benefitIndex)}
                className={`group relative bg-gray-50 border border-gray-200 dark:bg-white/[0.03] dark:border-white/[0.06] rounded-xl p-7
                  hover:bg-white hover:border-gray-300 hover:shadow-lg hover:shadow-blue-500/5
                  dark:hover:bg-white/[0.05] dark:hover:border-white/[0.1] dark:hover:shadow-[#37bd7e]/5
                  transition-all backdrop-blur-sm ${onPersonaClick ? 'cursor-pointer' : ''}`}>
                <div className="w-12 h-12 bg-blue-500/10 dark:bg-[#37bd7e]/10 rounded-xl flex items-center justify-center mb-5
                  group-hover:bg-blue-500/15 dark:group-hover:bg-[#37bd7e]/15 transition-colors">
                  <Icon className="w-6 h-6 text-blue-500 dark:text-[#37bd7e]" />
                </div>
                <h3 className="font-display font-bold text-xl text-gray-900 dark:text-white mb-1">{persona.title}</h3>
                <p className="text-sm text-blue-500 dark:text-[#37bd7e] font-medium mb-4">{persona.subtitle}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 italic">&ldquo;{persona.pain}&rdquo;</p>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-5 leading-relaxed">{persona.solution}</p>
                <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-blue-500 dark:text-[#37bd7e]" />
                    <span className="text-sm font-semibold text-blue-500 dark:text-[#37bd7e]">{persona.stat}</span>
                  </div>
                  {onPersonaClick && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 group-hover:text-blue-500 dark:group-hover:text-[#37bd7e] transition-colors">
                      Learn more <ArrowRight className="w-3 h-3 inline" />
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  #4 BEFORE/AFTER — "Without 60" vs "With 60"
// ═══════════════════════════════════════════════════════════════

const BEFORE_AFTER_ROWS = [
  { metric: 'Follow-up time', before: '24-72 hours', after: '< 5 minutes' },
  { metric: 'Follow-up rate', before: '~40%', after: '94%' },
  { metric: 'Tools needed', before: '5-8 separate tools', after: '1 command center' },
  { metric: 'Meeting prep', before: '30 min manual research', after: 'Auto-delivered 2hrs before' },
  { metric: 'Pipeline visibility', before: 'Spreadsheets & guesswork', after: 'AI health scoring in real-time' },
];

export function BeforeAfterV22() {
  return (
    <section className="bg-gray-50 dark:bg-[#0a1020] py-14 md:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-12">
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-400 mb-4 tracking-wide uppercase">The difference</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            Before &amp; after 60
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Without 60 */}
          <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
            className="rounded-xl border border-red-200 dark:border-red-500/20 bg-white dark:bg-white/[0.02] p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <h3 className="font-display font-bold text-lg text-gray-900 dark:text-white">Without 60</h3>
            </div>
            <div className="space-y-3.5">
              {BEFORE_AFTER_ROWS.map((row, i) => (
                <motion.div key={row.metric}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                >
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-0.5">{row.metric}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{row.before}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* With 60 */}
          <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
            className="rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-500/[0.03] p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
              <h3 className="font-display font-bold text-lg text-gray-900 dark:text-white">With 60</h3>
            </div>
            <div className="space-y-3.5">
              {BEFORE_AFTER_ROWS.map((row, i) => (
                <motion.div key={row.metric}
                  initial={{ opacity: 0, x: 12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 + 0.1 }}
                >
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400/70 mb-0.5">{row.metric}</p>
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{row.after}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  #10 BENEFITS — Accepts jumpToIndex prop
// ═══════════════════════════════════════════════════════════════

const BENEFIT_DURATION = 5000;

interface Benefit { id: string; icon: LucideIcon; headline: string; description: string; bullets: string[] }

const BENEFITS: Benefit[] = [
  { id: 'followups', icon: Mail, headline: 'Never miss a follow-up', description: '8 types of follow-up \u2014 post-meeting recaps, no-show recovery, renewal reminders \u2014 all drafted in your voice and sent at the right time.', bullets: ['Auto-drafted within minutes of every meeting', 'Adapts tone and context per deal stage', 'Sent via email or Slack \u2014 wherever you work'] },
  { id: 'meetings', icon: Calendar, headline: 'Walk into every meeting prepared', description: 'Stakeholder history, talking points, competitor intel, and risk flags \u2014 delivered to Slack 2 hours before every call.', bullets: ['Briefs auto-generated from CRM + email context', 'Talking points tailored to each attendee', 'Delivered to Slack so you never miss them'] },
  { id: 'deals', icon: Target, headline: 'Know which deals need attention', description: 'Health scoring, slippage alerts, and rescue plans \u2014 60 watches every deal and flags before you notice.', bullets: ['AI health score updated after every interaction', 'Slippage alerts before deals go cold', 'Suggested next best action for every deal'] },
  { id: 'prospecting', icon: Search, headline: 'Find the right prospects instantly', description: 'Company research, decision-maker search, and ICP matching \u2014 across Apollo, AI Ark, Explorium, and Apify.', bullets: ['Search 150M+ profiles with natural language', 'Auto-enrich with email, phone, and LinkedIn', 'ICP matching and lookalike company discovery'] },
  { id: 'proposals', icon: FileText, headline: 'Close faster with instant proposals', description: 'Proposals generated from deal context, meeting transcripts, and your brand styling \u2014 ready to send in seconds.', bullets: ['Auto-pulls from meetings and deal history', 'Custom pricing, timelines, and scope', 'One-click send as branded PDF'] },
  { id: 'pipeline', icon: Activity, headline: 'Pipeline that runs itself', description: 'Stale deal detection, missing next steps, automatic stage updates \u2014 your CRM stays current without you touching it.', bullets: ['Stale deals flagged and re-engaged automatically', 'Missing next steps detected and filled', 'Weekly hygiene digest with focus tasks'] },
];

export function BenefitsV22({ jumpToIndex }: { jumpToIndex?: number | null }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const isPaused = useRef(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: false, margin: '-100px' });

  const [mountedIndices, setMountedIndices] = useState<Set<number>>(new Set([0]));

  useEffect(() => {
    setMountedIndices((prev) => {
      if (prev.has(activeIndex)) return prev;
      const next = new Set(prev);
      next.add(activeIndex);
      return next;
    });
  }, [activeIndex]);

  // Jump to index when prop changes
  useEffect(() => {
    if (jumpToIndex != null && jumpToIndex >= 0 && jumpToIndex < BENEFITS.length) {
      setActiveIndex(jumpToIndex);
      setProgressKey((k) => k + 1);
    }
  }, [jumpToIndex]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!isPaused.current && isInView) {
        setActiveIndex((i) => (i + 1) % BENEFITS.length);
        setProgressKey((k) => k + 1);
      }
    }, BENEFIT_DURATION);
    return () => clearInterval(id);
  }, [isInView]);

  const handleSelect = useCallback((index: number) => {
    setActiveIndex(index);
    setProgressKey((k) => k + 1);
  }, []);

  const activeBenefit = BENEFITS[activeIndex];

  return (
    <section ref={sectionRef} id="features" className="bg-white dark:bg-[#070b18] py-14 md:py-20">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-12 md:mb-16">
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-400 mb-4 tracking-wide uppercase">Why teams choose 60</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            Stop doing sales admin. Start closing deals.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            Every feature is designed around one question: does this help you close faster?
          </p>
        </motion.div>

        <div className="mb-8"
          onMouseEnter={() => { isPaused.current = true; setIsHovered(true); }}
          onMouseLeave={() => { isPaused.current = false; setIsHovered(false); }}>

          {/* Mobile pills */}
          <div className="flex md:hidden gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {BENEFITS.map((benefit, i) => {
              const Icon = benefit.icon;
              const active = i === activeIndex;
              return (
                <button key={benefit.id} onClick={() => handleSelect(i)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? 'bg-blue-500/15 text-blue-500 border border-blue-500/20 dark:bg-[#37bd7e]/15 dark:text-[#37bd7e] dark:border-[#37bd7e]/20'
                      : 'text-gray-500 dark:text-gray-400 border border-transparent hover:bg-gray-100 dark:hover:bg-white/[0.04]'
                  }`}>
                  <Icon className="w-3.5 h-3.5" />
                  {benefit.headline.replace(/^(Never|Walk|Know|Find|Close|Pipeline) /, '')}
                </button>
              );
            })}
          </div>

          {/* Desktop tab bar */}
          <div className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-gray-100 border border-gray-200 dark:bg-white/[0.03] dark:border-white/[0.06] backdrop-blur-sm">
            {BENEFITS.map((benefit, i) => {
              const Icon = benefit.icon;
              const active = i === activeIndex;
              return (
                <button key={benefit.id} onClick={() => handleSelect(i)}
                  className={`relative flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                    active ? 'text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}>
                  {active && (
                    <motion.div layoutId="benefit-tab-v22"
                      className="absolute inset-0 bg-white rounded-lg border border-gray-200 shadow-sm dark:bg-white/[0.08] dark:border-white/[0.06] dark:shadow-none"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">{benefit.headline.split(' ').slice(0, 3).join(' ')}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Progress */}
          <div className="mt-2 h-1 rounded-full bg-gray-200 dark:bg-white/[0.04] overflow-hidden">
            {!isHovered && (
              <motion.div
                key={`bp-${progressKey}`}
                className="h-full rounded-full bg-blue-500 dark:bg-[#37bd7e]"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: BENEFIT_DURATION / 1000, ease: 'linear' }}
              />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-start">
          <AnimatePresence mode="wait">
            <motion.div key={activeBenefit.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-5">
              <div>
                <h3 className="font-display font-bold text-2xl md:text-3xl text-gray-900 dark:text-white mb-3">{activeBenefit.headline}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-base font-body leading-relaxed">{activeBenefit.description}</p>
              </div>
              <ul className="space-y-3">
                {activeBenefit.bullets.map((bullet, i) => (
                  <motion.li key={bullet} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.1 }} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-blue-500 dark:text-[#37bd7e] shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-600 dark:text-gray-300">{bullet}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>

          <div className="rounded-xl bg-gray-50 border border-gray-200 dark:bg-white/[0.03] dark:border-white/[0.06] backdrop-blur-sm p-5 sm:p-6 min-h-[260px] overflow-hidden">
            {/* Placeholder illustrations — keep state preserved via visibility toggle */}
            {BENEFITS.map((b, i) => (
              <div
                key={b.id}
                style={activeIndex === i
                  ? { visibility: 'visible' as const, height: 'auto', overflow: 'visible' as const }
                  : { visibility: 'hidden' as const, height: 0, overflow: 'hidden' as const }
                }
              >
                {mountedIndices.has(i) && <BenefitIllustration benefit={b} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BenefitIllustration({ benefit }: { benefit: Benefit }) {
  const Icon = benefit.icon;
  return (
    <div className="space-y-3">
      {benefit.bullets.map((bullet, i) => (
        <motion.div key={bullet} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.15, duration: 0.3 }}
          className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-100 border border-gray-200 dark:bg-white/[0.04] dark:border-white/[0.06] backdrop-blur-sm">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ delay: i * 0.15 + 0.3, type: 'spring', stiffness: 400, damping: 15 }}>
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          </motion.div>
          <span className="text-sm text-gray-600 dark:text-gray-300">{bullet}</span>
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: i * 0.15 + 0.5 }}
            className="ml-auto text-[10px] text-emerald-400 font-medium">Done</motion.span>
        </motion.div>
      ))}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-100 border border-gray-200 dark:bg-white/[0.04] dark:border-white/[0.06] backdrop-blur-sm">
        <div className="flex gap-1 items-center">
          {[0, 1, 2].map((dot) => (
            <motion.div key={dot}
              className="w-1.5 h-1.5 rounded-full bg-blue-400 dark:bg-[#37bd7e]"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: dot * 0.2 }} />
          ))}
        </div>
        <span className="text-sm text-gray-400 italic">Processing next task...</span>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  #8 COMPARISON TABLE — "60 vs 5 tools"
// ═══════════════════════════════════════════════════════════════

const COMPARISON_ROWS = [
  { feature: 'Follow-ups', sixty: 'AI-drafted in your voice, 8 types', diy: 'Manual typing in Gmail', diyCost: 'Free' },
  { feature: 'Meeting Prep', sixty: 'Auto-brief 2hrs before every call', diy: 'LinkedIn + Google + CRM', diyCost: '$0' },
  { feature: 'Prospecting', sixty: '150M+ contacts, natural language search', diy: 'Apollo / ZoomInfo', diyCost: '$99/mo' },
  { feature: 'Pipeline Management', sixty: 'AI health scores, rescue plans', diy: 'HubSpot / Salesforce', diyCost: '$50/mo' },
  { feature: 'Proposals', sixty: 'Generated from deal context in seconds', diy: 'PandaDoc / Proposify', diyCost: '$49/mo' },
  { feature: 'Coaching & Analytics', sixty: 'Meeting analysis, objection tracking', diy: 'Gong / Chorus', diyCost: '$300/mo' },
];

export function ComparisonTableV22() {
  return (
    <section className="bg-white dark:bg-[#070b18] py-14 md:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-12">
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-400 mb-4 tracking-wide uppercase">Why switch</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            60 vs 5+ separate tools
          </h2>
        </motion.div>

        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_1fr_1fr] bg-gray-50 dark:bg-white/[0.03]">
            <div className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider" />
            <div className="px-4 py-3 text-xs font-semibold text-blue-600 dark:text-[#37bd7e] uppercase tracking-wider text-center border-l border-gray-200 dark:border-white/[0.06]">
              60
            </div>
            <div className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center border-l border-gray-200 dark:border-white/[0.06]">
              DIY Stack
            </div>
          </div>

          {/* Rows */}
          {COMPARISON_ROWS.map((row, i) => (
            <motion.div key={row.feature}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="grid grid-cols-[1fr_1fr_1fr] border-t border-gray-100 dark:border-white/[0.04]"
            >
              <div className="px-4 py-3.5">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{row.feature}</p>
              </div>
              <div className="px-4 py-3.5 border-l border-gray-100 dark:border-white/[0.04] bg-emerald-50/30 dark:bg-emerald-500/[0.02]">
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{row.sixty}</span>
                </div>
              </div>
              <div className="px-4 py-3.5 border-l border-gray-100 dark:border-white/[0.04]">
                <p className="text-sm text-gray-500 dark:text-gray-400">{row.diy}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{row.diyCost}</p>
              </div>
            </motion.div>
          ))}

          {/* Total row */}
          <div className="grid grid-cols-[1fr_1fr_1fr] border-t-2 border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.02]">
            <div className="px-4 py-4">
              <p className="text-sm font-bold text-gray-900 dark:text-white">Total cost</p>
            </div>
            <div className="px-4 py-4 border-l border-gray-200 dark:border-white/[0.06] bg-emerald-50/50 dark:bg-emerald-500/[0.03]">
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">$49<span className="text-sm font-normal">/mo</span></p>
            </div>
            <div className="px-4 py-4 border-l border-gray-200 dark:border-white/[0.06]">
              <p className="text-lg font-bold text-gray-500">$500+<span className="text-sm font-normal">/mo</span></p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  #9 TESTIMONIALS — Mobile drag carousel
// ═══════════════════════════════════════════════════════════════

const TESTIMONIALS = [
  {
    quote: "We were spending 3 hours a day on meeting prep and follow-ups. 60 cut that to minutes. It\u2019s not a tool \u2014 it\u2019s a teammate.",
    author: 'Rachel M.',
    role: 'Account Executive',
    company: 'B2B SaaS, 12-person team',
    avatarUrl: 'https://i.pravatar.cc/80?img=5',
    rating: 5,
  },
  {
    quote: "I was about to hire a sales leader for $120K. Instead we invested in 60. Three months later, pipeline is 3x and we didn\u2019t add a single person.",
    author: 'Grace E.',
    role: 'COO',
    company: 'Financial Services, $7M revenue',
    avatarUrl: 'https://i.pravatar.cc/80?img=16',
    rating: 5,
  },
  {
    quote: "The command center changed everything. Voice command to find leads, enrich them, write sequences, and push to LinkedIn \u2014 all in one screen. My head nearly exploded.",
    author: 'David L.',
    role: 'VP Sales',
    company: '40-person sales org',
    avatarUrl: 'https://i.pravatar.cc/80?img=12',
    rating: 5,
  },
  {
    quote: "We tried Clay, Apollo, and three other tools. 60 is the only one that actually does the work instead of just showing you data.",
    author: 'Sarah T.',
    role: 'Head of Revenue',
    company: 'Growth-stage SaaS',
    avatarUrl: 'https://i.pravatar.cc/80?img=20',
    rating: 5,
  },
];

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5 mb-4">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
      ))}
    </div>
  );
}

function TestimonialAvatar({ url, name }: { url: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 ring-2 ring-white dark:ring-white/10 shadow-md">
      {!errored ? (
        <img
          src={url}
          alt={name}
          width={48}
          height={48}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          loading="lazy"
        />
      ) : null}
      {(errored || !loaded) && (
        <div className={`w-full h-full bg-gradient-to-br from-blue-500 to-cyan-400 dark:from-emerald-500 dark:to-teal-400 flex items-center justify-center ${loaded && !errored ? 'hidden' : ''}`}>
          <span className="text-sm font-bold text-white">{name.charAt(0)}</span>
        </div>
      )}
    </div>
  );
}

function TestimonialCard({ t }: { t: typeof TESTIMONIALS[number] }) {
  return (
    <div className="bg-gray-50 border border-gray-200 dark:bg-white/[0.03] dark:border-white/[0.06] rounded-xl p-8 backdrop-blur-sm
      hover:bg-gray-100 hover:border-gray-300 dark:hover:bg-white/[0.05] dark:hover:border-white/[0.08] transition-all">
      <StarRating count={t.rating} />
      <p className="text-gray-600 dark:text-gray-300 text-base leading-relaxed font-body mb-6">
        &ldquo;{t.quote}&rdquo;
      </p>
      <div className="flex items-center gap-3">
        <TestimonialAvatar url={t.avatarUrl} name={t.author} />
        <div>
          <p className="font-medium text-gray-900 dark:text-white text-sm">{t.author}</p>
          <p className="text-gray-600 dark:text-gray-400 text-sm">{t.role}</p>
          <p className="text-gray-400 dark:text-gray-500 text-xs">{t.company}</p>
        </div>
      </div>
    </div>
  );
}

export function TestimonialsV22() {
  const [mobileIndex, setMobileIndex] = useState(0);
  const dragConstraints = useRef<HTMLDivElement>(null);

  const handleDragEnd = useCallback((_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    const swipe = info.offset.x + info.velocity.x * 0.5;
    if (swipe < -50 && mobileIndex < TESTIMONIALS.length - 1) {
      setMobileIndex(i => i + 1);
    } else if (swipe > 50 && mobileIndex > 0) {
      setMobileIndex(i => i - 1);
    }
  }, [mobileIndex]);

  return (
    <section className="bg-white dark:bg-[#070b18] py-16 md:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-16">
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-400 mb-4 tracking-wide uppercase">From early users</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            Teams building pipeline faster with 60
          </h2>
        </motion.div>

        {/* Desktop: grid */}
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="hidden md:grid grid-cols-2 gap-6">
          {TESTIMONIALS.map((t) => (
            <motion.div key={t.author} variants={fadeUp}>
              <TestimonialCard t={t} />
            </motion.div>
          ))}
        </motion.div>

        {/* Mobile: drag carousel */}
        <div className="md:hidden overflow-hidden" ref={dragConstraints}>
          <motion.div
            className="flex"
            animate={{ x: `-${mobileIndex * 100}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
          >
            {TESTIMONIALS.map((t) => (
              <div key={t.author} className="w-full shrink-0 px-1">
                <TestimonialCard t={t} />
              </div>
            ))}
          </motion.div>

          {/* Dot indicators */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                onClick={() => setMobileIndex(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === mobileIndex ? 'bg-blue-500 dark:bg-[#37bd7e] w-5' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  #5 FAQ — Accordion
// ═══════════════════════════════════════════════════════════════

const FAQ_ITEMS = [
  {
    question: 'How long does it take to set up?',
    answer: 'Most teams are live in under 48 hours. Connect your CRM, calendar, and email — 60 starts learning your patterns immediately. No complex onboarding or training required.',
  },
  {
    question: 'Which CRMs does 60 work with?',
    answer: 'HubSpot, Attio, and Bullhorn today. Salesforce and Pipedrive are coming soon. 60 syncs bi-directionally — deals, contacts, activities all stay in sync.',
  },
  {
    question: 'Is my data secure?',
    answer: 'Yes. 60 uses 256-bit encryption at rest and in transit. We\u2019re SOC 2 compliant and GDPR-ready. Your data is never used to train AI models and you can delete it at any time.',
  },
  {
    question: 'What happens after the early access period?',
    answer: 'Early access users get locked-in founder pricing for life. When we launch publicly, pricing will increase. You\u2019ll keep your rate as long as your account stays active.',
  },
  {
    question: 'Do I need to change how I work?',
    answer: 'No. 60 works where you already work — Slack, email, and your calendar. It learns your patterns and adapts. Most users see value in the first week without changing a single workflow.',
  },
];

export function FAQV22() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="bg-gray-50 dark:bg-[#0a1020] py-14 md:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-12">
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-400 mb-4 tracking-wide uppercase">FAQ</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            Common questions
          </h2>
        </motion.div>

        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => {
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
                  <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="shrink-0"
                  >
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
                      <p className="px-5 pb-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {item.answer}
                      </p>
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

// ═══════════════════════════════════════════════════════════════
//  #7 CTA — Trust badges below button
// ═══════════════════════════════════════════════════════════════

const TRUST_BADGES = [
  { icon: ShieldCheck, label: 'SOC 2 Compliant' },
  { icon: Lock, label: 'GDPR Ready' },
  { icon: Shield, label: '256-bit Encryption' },
  { icon: Clock, label: '99.9% Uptime' },
];

export function CTAV22() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section ref={ref} className="relative bg-gray-50 dark:bg-[#0a1020] py-16 md:py-24 overflow-hidden">
      {/* Glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.06] blur-[120px] bg-blue-500 dark:bg-[#37bd7e]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-w-3xl mx-auto px-6 text-center"
      >
        <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-white tracking-tight">
          Your AI sales team is ready
        </h2>
        <p className="mt-6 text-gray-500 dark:text-gray-400 text-lg font-body">
          Stop paying for tools that don&apos;t talk to each other. Start with the command center that does everything.
        </p>

        {/* Pricing anchor */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-blue-500 dark:text-[#37bd7e]" />
            Free to start
          </span>
          <span className="hidden sm:inline text-gray-300 dark:text-gray-600">|</span>
          <span className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-blue-500 dark:text-[#37bd7e]" />
            Plans from $49/mo
          </span>
          <span className="hidden sm:inline text-gray-300 dark:text-gray-600">|</span>
          <span className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-blue-500 dark:text-[#37bd7e]" />
            No contracts
          </span>
        </div>

        <div className="mt-10">
          <a
            href="https://app.use60.com/auth/signup"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-semibold
              bg-blue-500 text-white hover:bg-blue-600 dark:bg-[#37bd7e] dark:hover:bg-[#2ea86d]
              transition-all hover:translate-y-[-1px] hover:shadow-lg hover:shadow-blue-500/25 dark:hover:shadow-[#37bd7e]/25
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-[#37bd7e] focus-visible:ring-offset-2 focus-visible:ring-offset-gray-50 dark:focus-visible:ring-offset-[#0a1020]">
            Get Started
            <ArrowRight className="w-5 h-5" />
          </a>
        </div>

        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="mt-4 text-sm text-gray-500 hover:text-blue-500 dark:hover:text-[#37bd7e] transition-colors font-body cursor-pointer">
          Or try the demo — enter any company domain above
        </button>

        {/* Trust badges */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
          {TRUST_BADGES.map((badge) => {
            const Icon = badge.icon;
            return (
              <div key={badge.label} className="flex items-center gap-1.5">
                <Icon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{badge.label}</span>
              </div>
            );
          })}
        </div>
      </motion.div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  #12 VIDEO SECTION — "See it in 60 seconds"
// ═══════════════════════════════════════════════════════════════

const VIDEO_CHAPTERS = [
  { time: '0:00', label: 'Find prospects', color: 'bg-blue-500' },
  { time: '0:10', label: 'Enrich & outreach', color: 'bg-violet-500' },
  { time: '0:22', label: 'Meeting prep', color: 'bg-amber-500' },
  { time: '0:35', label: 'AI follow-up', color: 'bg-emerald-500' },
  { time: '0:48', label: 'Pipeline autopilot', color: 'bg-rose-500' },
];

function VideoPreviewFrame({ onPlay }: { onPlay: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative rounded-2xl overflow-hidden cursor-pointer group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onPlay}
    >
      {/* Browser chrome */}
      <div className="bg-gray-50 dark:bg-[#0a0f1a] border border-gray-200 dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl shadow-gray-300/40 dark:shadow-black/40">
        <div className="h-10 border-b border-gray-200 dark:border-white/[0.06] flex items-center px-4 gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400/60" />
          <div className="w-3 h-3 rounded-full bg-amber-400/60" />
          <div className="w-3 h-3 rounded-full bg-emerald-400/60" />
          <div className="flex-1 flex justify-center">
            <div className="px-5 py-1 rounded-md bg-gray-100 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06]">
              <span className="text-xs text-gray-500 font-mono">app.use60.com</span>
            </div>
          </div>
        </div>

        {/* Video area with simulated dashboard screenshot */}
        <div className="relative bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-[#0c1221] dark:via-[#0e1428] dark:to-[#0c1221]" style={{ aspectRatio: '16/9' }}>
          {/* Simulated dashboard UI */}
          <div className="absolute inset-0 p-6 md:p-10">
            <div className="h-full flex flex-col gap-4 opacity-60">
              {/* Top bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 dark:bg-emerald-500/20" />
                  <div className="space-y-1">
                    <div className="w-24 h-2 rounded-full bg-gray-300 dark:bg-white/10" />
                    <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-white/5" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-white/10" />
                  <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-white/10" />
                </div>
              </div>
              {/* KPI row */}
              <div className="grid grid-cols-4 gap-3">
                {[1,2,3,4].map(i => (
                  <div key={i} className="rounded-lg bg-white/50 dark:bg-white/[0.03] border border-gray-200/50 dark:border-white/[0.04] p-3">
                    <div className="w-10 h-1.5 rounded-full bg-gray-200 dark:bg-white/10 mb-2" />
                    <div className="w-14 h-3 rounded-full bg-gray-300 dark:bg-white/15" />
                  </div>
                ))}
              </div>
              {/* Content area */}
              <div className="flex-1 grid grid-cols-3 gap-3">
                <div className="col-span-2 rounded-lg bg-white/50 dark:bg-white/[0.03] border border-gray-200/50 dark:border-white/[0.04] p-3">
                  <div className="space-y-2">
                    {[1,2,3,4].map(i => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-gray-200 dark:bg-white/10 shrink-0" />
                        <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-white/8" />
                        <div className="w-10 h-2 rounded-full bg-gray-200 dark:bg-white/6" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg bg-white/50 dark:bg-white/[0.03] border border-gray-200/50 dark:border-white/[0.04] p-3">
                  <div className="space-y-2">
                    {[1,2,3].map(i => (
                      <div key={i} className="h-2 rounded-full bg-gray-200 dark:bg-white/10" style={{ width: `${70 + i * 10}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Play button overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{ scale: hovered ? 1.1 : 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="relative"
            >
              {/* Pulse ring */}
              <div className="absolute inset-0 rounded-full bg-blue-500/20 dark:bg-[#37bd7e]/20 animate-ping" style={{ animationDuration: '2s' }} />
              <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full bg-blue-500/90 dark:bg-[#37bd7e]/90 backdrop-blur-sm flex items-center justify-center shadow-2xl shadow-blue-500/30 dark:shadow-[#37bd7e]/30">
                <Play className="w-8 h-8 md:w-10 md:h-10 text-white fill-white ml-1" />
              </div>
            </motion.div>
          </div>

          {/* Duration badge */}
          <div className="absolute bottom-4 right-4 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm">
            <span className="text-xs font-mono text-white font-medium">1:00</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="relative w-full max-w-5xl z-10"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        {/* Video player placeholder */}
        <div className="rounded-2xl overflow-hidden bg-black shadow-2xl" style={{ aspectRatio: '16/9' }}>
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            {/* Simulated video player UI */}
            <div className="w-16 h-16 rounded-full bg-blue-500/20 dark:bg-[#37bd7e]/20 flex items-center justify-center">
              <Play className="w-8 h-8 text-blue-400 dark:text-[#37bd7e] fill-current ml-0.5" />
            </div>
            <p className="text-white/70 text-sm font-medium">Product walkthrough coming soon</p>
            <p className="text-white/40 text-xs">In the meantime, try the interactive demo above</p>
          </div>
        </div>

        {/* Chapter markers */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto scrollbar-hide">
          {VIDEO_CHAPTERS.map((ch) => (
            <div key={ch.time} className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm">
              <div className={`w-2 h-2 rounded-full ${ch.color}`} />
              <span className="text-xs text-white/60 font-mono">{ch.time}</span>
              <span className="text-xs text-white/80 font-medium">{ch.label}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function VideoSectionV22() {
  const [showModal, setShowModal] = useState(false);

  return (
    <section className="bg-white dark:bg-[#070b18] py-14 md:py-20 overflow-hidden">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-10">
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-400 mb-4 tracking-wide uppercase">Product walkthrough</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            See it in 60 seconds
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            From finding prospects to closing deals — watch the entire platform in action.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 32, scale: 0.96 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <VideoPreviewFrame onPlay={() => setShowModal(true)} />
        </motion.div>

        {/* Chapter markers below video */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex items-center justify-center gap-3 md:gap-5 mt-6 flex-wrap"
        >
          {VIDEO_CHAPTERS.map((ch, i) => (
            <div key={ch.time} className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${ch.color}`} />
              <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{ch.time}</span>
              <span className="text-xs text-gray-600 dark:text-gray-400">{ch.label}</span>
            </div>
          ))}
        </motion.div>
      </div>

      <AnimatePresence>
        {showModal && <VideoModal onClose={() => setShowModal(false)} />}
      </AnimatePresence>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  #13 STATS WITH CONTEXT — Expandable breakdown cards
// ═══════════════════════════════════════════════════════════════

interface StatWithContext {
  icon: LucideIcon;
  target: number;
  suffix: string;
  prefix: string;
  label: string;
  breakdown: { label: string; value: string }[];
}

const STATS_WITH_CONTEXT: StatWithContext[] = [
  {
    icon: Clock,
    target: 15,
    suffix: '+',
    prefix: '',
    label: 'hours saved per rep, per week',
    breakdown: [
      { label: 'Follow-up drafting', value: '5 hrs' },
      { label: 'Meeting prep', value: '4 hrs' },
      { label: 'Prospecting & enrichment', value: '3 hrs' },
      { label: 'CRM admin', value: '2 hrs' },
      { label: 'Proposal creation', value: '1 hr' },
    ],
  },
  {
    icon: Zap,
    target: 48,
    suffix: '',
    prefix: '',
    label: 'hours to go live',
    breakdown: [
      { label: 'CRM connection', value: '5 min' },
      { label: 'Calendar sync', value: '2 min' },
      { label: 'AI learning patterns', value: '24 hrs' },
      { label: 'First automated actions', value: '48 hrs' },
    ],
  },
  {
    icon: TrendingUp,
    target: 94,
    suffix: '%',
    prefix: '',
    label: 'follow-up rate',
    breakdown: [
      { label: 'Industry average', value: '40%' },
      { label: 'With basic CRM reminders', value: '58%' },
      { label: 'With 60 (AI-drafted)', value: '94%' },
      { label: 'Improvement', value: '+135%' },
    ],
  },
  {
    icon: DollarSign,
    target: 255,
    suffix: 'K+',
    prefix: '$',
    label: 'saved vs. hiring',
    breakdown: [
      { label: 'SDR salary + benefits', value: '$85K' },
      { label: 'Sales ops hire', value: '$95K' },
      { label: 'Tool stack (5+ tools)', value: '$75K' },
      { label: '60 replaces all three', value: '$49/mo' },
    ],
  },
];

function StatsCountUp({ target, isInView: visible }: { target: number; isInView: boolean }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let frame: number;
    const start = performance.now();
    const duration = 2000;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(eased * target));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, target]);
  return <>{count}</>;
}

export function StatsWithContextV22() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <section className="bg-gray-50 dark:bg-[#0a1020] py-14 md:py-20">
      <div ref={ref} className="max-w-5xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-12">
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-400 mb-4 tracking-wide uppercase">By the numbers</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            Results teams actually see
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-base font-body max-w-xl mx-auto">
            Tap any stat to see how we get there
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS_WITH_CONTEXT.map((stat, i) => {
            const Icon = stat.icon;
            const isExpanded = expandedIndex === i;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => setExpandedIndex(isExpanded ? null : i)}
                className={`relative rounded-xl border backdrop-blur-sm p-5 cursor-pointer transition-all duration-200 ${
                  isExpanded
                    ? 'bg-white dark:bg-white/[0.06] border-blue-200 dark:border-[#37bd7e]/30 shadow-lg shadow-blue-500/10 dark:shadow-[#37bd7e]/10 ring-1 ring-blue-500/10 dark:ring-[#37bd7e]/10'
                    : 'bg-white dark:bg-white/[0.03] border-gray-200 dark:border-white/[0.06] hover:border-gray-300 dark:hover:border-white/[0.1] hover:shadow-md'
                }`}
              >
                {/* Main stat */}
                <div className="text-center">
                  <div className="flex justify-center mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center backdrop-blur-sm transition-colors ${
                      isExpanded
                        ? 'bg-blue-500/15 dark:bg-[#37bd7e]/15'
                        : 'bg-gray-100 border border-gray-200 dark:bg-white/[0.04] dark:border-white/[0.08]'
                    }`}>
                      <Icon className={`w-5 h-5 transition-colors ${
                        isExpanded ? 'text-blue-500 dark:text-[#37bd7e]' : 'text-gray-400'
                      }`} />
                    </div>
                  </div>
                  <div className="text-3xl font-display font-bold text-blue-500 dark:text-[#37bd7e] tabular-nums">
                    {stat.prefix}<StatsCountUp target={stat.target} isInView={isInView} />{stat.suffix}
                  </div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 font-body">{stat.label}</div>

                  {/* Expand hint */}
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-2 flex justify-center"
                  >
                    <ChevronDown className={`w-4 h-4 transition-colors ${
                      isExpanded ? 'text-blue-500 dark:text-[#37bd7e]' : 'text-gray-300 dark:text-gray-600'
                    }`} />
                  </motion.div>
                </div>

                {/* Expandable breakdown */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="pt-4 mt-4 border-t border-gray-100 dark:border-white/[0.06] space-y-2">
                        {stat.breakdown.map((item, j) => (
                          <motion.div
                            key={item.label}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: j * 0.06 }}
                            className="flex items-center justify-between"
                          >
                            <span className="text-xs text-gray-500 dark:text-gray-400">{item.label}</span>
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{item.value}</span>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">Based on teams using 60 for 30+ days</p>
      </div>
    </section>
  );
}

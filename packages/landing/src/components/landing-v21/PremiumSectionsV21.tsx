/**
 * V21 Premium Sections — 5 strategic improvements over V20
 *
 * New/modified sections:
 *   1. CredibilityBarV21 — Founder credibility + stats (replaces generic logo bar)
 *   2. ProductShowcaseV21 — Cinematic passive dashboard preview
 *   3. WhoItsForV21 — Persona cards for visitor self-qualification
 *   4. TestimonialsV21 — Headshot photos + company names + star ratings
 *   5. CTAV21 — Pricing anchor near CTA
 *
 * Unchanged sections imported directly from V20 by LandingPageV21:
 *   HeroV20, BenefitsV20, IntegrationsV20, StatsV20, FooterV20
 */

import { useState, useRef, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  ArrowRight, Check, Star, Rocket, Users, Building2,
  Clock, TrendingUp, Zap, DollarSign, Mail, Calendar,
  BarChart3, Search, Activity,
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
//  1. CREDIBILITY BAR (replaces LogoBarV20)
// ═══════════════════════════════════════════════════════════════

const CREDIBILITY_STATS = [
  { icon: Clock, value: '10', suffix: ' years', label: 'of GTM expertise' },
  { icon: Users, value: '200', suffix: '+', label: 'clients served' },
  { icon: DollarSign, value: '500', suffix: 'M+', label: 'pipeline generated' },
  { icon: TrendingUp, value: '40', suffix: '%', label: 'avg close rate lift' },
];

export function CredibilityBarV21() {
  return (
    <section className="bg-gray-50 dark:bg-[#070b18] py-12 md:py-16 border-b border-gray-200 dark:border-white/[0.04]">
      <motion.div
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
                  {stat.value}<span className="text-blue-500 dark:text-[#37bd7e]">{stat.suffix}</span>
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
//  2. PRODUCT SHOWCASE — Cinematic passive dashboard preview
// ═══════════════════════════════════════════════════════════════

const SHOWCASE_ACTIVITIES = [
  { icon: Mail, text: 'Follow-up sent to Campium', time: '2m ago', color: 'text-blue-400' },
  { icon: Calendar, text: 'Meeting prep ready — DataForge', time: '15m ago', color: 'text-violet-400' },
  { icon: TrendingUp, text: 'Deal stage updated: NeuralPath', time: '1h ago', color: 'text-emerald-400' },
  { icon: Search, text: '23 new ICP matches found', time: '2h ago', color: 'text-amber-400' },
  { icon: Activity, text: 'Pipeline health score: 87%', time: '3h ago', color: 'text-sky-400' },
  { icon: Mail, text: 'No-show recovery sent — Acme', time: '4h ago', color: 'text-rose-400' },
];

function ShowcaseDashboard() {
  const [visibleActivities, setVisibleActivities] = useState(SHOWCASE_ACTIVITIES.slice(0, 3));
  const nextIndexRef = useRef(3);

  useEffect(() => {
    const interval = setInterval(() => {
      const nextIdx = nextIndexRef.current % SHOWCASE_ACTIVITIES.length;
      nextIndexRef.current += 1;
      setVisibleActivities((prev) => [SHOWCASE_ACTIVITIES[nextIdx], ...prev.slice(0, 2)]);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const kpis = [
    { label: 'Pipeline Value', val: '$127.4K', change: '+12%', up: true },
    { label: 'Meetings Today', val: '4', change: '2 prepped', up: true },
    { label: 'Follow-ups Due', val: '3', change: 'AI drafted', up: true },
    { label: 'Deals at Risk', val: '1', change: 'Rescue ready', up: false },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="relative rounded-xl overflow-hidden
        bg-white dark:bg-[#0c1221] border border-gray-200 dark:border-white/[0.08]
        shadow-2xl shadow-gray-300/40 dark:shadow-black/40">

        {/* Top bar */}
        <div className="h-10 bg-gray-50 dark:bg-[#0a0f1a] border-b border-gray-200 dark:border-white/[0.06] flex items-center px-4 gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400/60" />
          <div className="w-3 h-3 rounded-full bg-amber-400/60" />
          <div className="w-3 h-3 rounded-full bg-emerald-400/60" />
          <div className="flex-1 flex justify-center">
            <div className="px-5 py-1 rounded-md bg-gray-100 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06]">
              <span className="text-xs text-gray-500 font-mono">app.use60.com</span>
            </div>
          </div>
        </div>

        <div className="flex">
          {/* Sidebar */}
          <div className="hidden md:block w-14 bg-gray-50 dark:bg-[#080d17] border-r border-gray-200 dark:border-white/[0.06] py-3">
            <div className="flex items-center justify-center mb-3">
              <div className="w-7 h-7 rounded bg-blue-500/15 dark:bg-emerald-500/20" />
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={`w-7 h-7 mx-auto mt-2 rounded-lg flex items-center justify-center ${
                i === 1 ? 'bg-blue-500/10 border border-blue-500/20 dark:bg-emerald-500/10 dark:border-emerald-500/20' : 'bg-gray-100 dark:bg-white/[0.03]'
              }`}>
                <div className={`w-3 h-3 rounded-sm ${i === 1 ? 'bg-blue-400/40 dark:bg-emerald-400/40' : 'bg-gray-200 dark:bg-white/[0.08]'}`} />
              </div>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 p-4 md:p-6">
            {/* Greeting */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">Good morning, Alex</p>
                <p className="text-[11px] text-gray-400">Tuesday, March 14 — 3 meetings today</p>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 dark:bg-emerald-500/10">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-medium text-blue-500 dark:text-emerald-400">AI Active</span>
              </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {kpis.map((k) => (
                <div key={k.label} className="rounded-lg bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] p-3">
                  <p className="text-[10px] text-gray-400 mb-1">{k.label}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{k.val}</p>
                  <p className={`text-[10px] font-medium mt-0.5 ${k.up ? 'text-emerald-500' : 'text-amber-500'}`}>{k.change}</p>
                </div>
              ))}
            </div>

            {/* Activity feed */}
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Recent Activity</p>
              <div className="space-y-1.5">
                {visibleActivities.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={`${item.text}-${i}`}
                      initial={i === 0 ? { opacity: 0, y: -8 } : { opacity: 1, y: 0 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/[0.04]"
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                        <span className="text-[11px] text-gray-600 dark:text-gray-400">{item.text}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 ml-3 shrink-0">{item.time}</span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProductShowcaseV21() {
  return (
    <section className="bg-gray-50 dark:bg-[#0a1020] py-20 md:py-28 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-12">
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-400 mb-4 tracking-wide uppercase">The command center</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            See 60 in action
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            One screen. Every deal, every follow-up, every meeting — with AI working in the background.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 32, scale: 0.96 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <ShowcaseDashboard />
        </motion.div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  3. WHO IT'S FOR — Persona cards for self-qualification
// ═══════════════════════════════════════════════════════════════

interface Persona {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  pain: string;
  solution: string;
  stat: string;
}

const PERSONAS: Persona[] = [
  {
    icon: Rocket,
    title: 'Solo Founders',
    subtitle: 'Seed to Series A',
    pain: 'Too busy building product to follow up on leads.',
    solution: '60 handles prospecting, follow-ups, and meeting prep — so you focus on closing.',
    stat: 'Save 15+ hrs/week',
  },
  {
    icon: Users,
    title: 'Small Sales Teams',
    subtitle: '2–15 reps',
    pain: 'Everyone sells, nobody follows up consistently.',
    solution: '60 gives every rep enterprise-grade automation without enterprise-grade complexity.',
    stat: '94% follow-up rate',
  },
  {
    icon: Building2,
    title: 'Agencies & Consultancies',
    subtitle: 'Managing 10+ client accounts',
    pain: '20 clients, 100 deals, one person tracking it all.',
    solution: '60 orchestrates your whole pipeline so nothing slips between client accounts.',
    stat: '3x pipeline coverage',
  },
];

export function WhoItsForV21() {
  return (
    <section className="bg-white dark:bg-[#070b18] py-20 md:py-28">
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
                className="group relative bg-gray-50 border border-gray-200 dark:bg-white/[0.03] dark:border-white/[0.06] rounded-xl p-7
                  hover:bg-white hover:border-gray-300 hover:shadow-lg hover:shadow-blue-500/5
                  dark:hover:bg-white/[0.05] dark:hover:border-white/[0.1] dark:hover:shadow-[#37bd7e]/5
                  transition-all backdrop-blur-sm">
                <div className="w-12 h-12 bg-blue-500/10 dark:bg-[#37bd7e]/10 rounded-xl flex items-center justify-center mb-5
                  group-hover:bg-blue-500/15 dark:group-hover:bg-[#37bd7e]/15 transition-colors">
                  <Icon className="w-6 h-6 text-blue-500 dark:text-[#37bd7e]" />
                </div>
                <h3 className="font-display font-bold text-xl text-gray-900 dark:text-white mb-1">{persona.title}</h3>
                <p className="text-sm text-blue-500 dark:text-[#37bd7e] font-medium mb-4">{persona.subtitle}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 italic">&ldquo;{persona.pain}&rdquo;</p>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-5 leading-relaxed">{persona.solution}</p>
                <div className="flex items-center gap-2 pt-4 border-t border-gray-200 dark:border-white/[0.06]">
                  <Zap className="w-4 h-4 text-blue-500 dark:text-[#37bd7e]" />
                  <span className="text-sm font-semibold text-blue-500 dark:text-[#37bd7e]">{persona.stat}</span>
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
//  4. TESTIMONIALS — Headshots + company names + star ratings
// ═══════════════════════════════════════════════════════════════

const TESTIMONIALS = [
  {
    quote: "We were spending 3 hours a day on meeting prep and follow-ups. 60 cut that to minutes. It's not a tool — it's a teammate.",
    author: 'Rachel M.',
    role: 'Account Executive',
    company: 'B2B SaaS, 12-person team',
    avatarUrl: 'https://i.pravatar.cc/80?img=5',
    rating: 5,
  },
  {
    quote: "I was about to hire a sales leader for $120K. Instead we invested in 60. Three months later, pipeline is 3x and we didn't add a single person.",
    author: 'Grace E.',
    role: 'COO',
    company: 'Financial Services, $7M revenue',
    avatarUrl: 'https://i.pravatar.cc/80?img=16',
    rating: 5,
  },
  {
    quote: "The command center changed everything. Voice command to find leads, enrich them, write sequences, and push to LinkedIn — all in one screen. My head nearly exploded.",
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

export function TestimonialsV21() {
  return (
    <section className="bg-white dark:bg-[#070b18] py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-16">
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-400 mb-4 tracking-wide uppercase">From early users</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            Teams building pipeline faster with 60
          </h2>
        </motion.div>

        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {TESTIMONIALS.map((t) => (
            <motion.div key={t.author} variants={fadeUp}
              className="bg-gray-50 border border-gray-200 dark:bg-white/[0.03] dark:border-white/[0.06] rounded-xl p-8 backdrop-blur-sm
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
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  5. CTA — Pricing anchor + clean conversion
// ═══════════════════════════════════════════════════════════════

export function CTAV21() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section ref={ref} className="relative bg-gray-50 dark:bg-[#0a1020] py-24 md:py-32 overflow-hidden">
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
            href="https://www.use60.com/waitlist"
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
      </motion.div>
    </section>
  );
}

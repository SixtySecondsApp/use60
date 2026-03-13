/**
 * V18 Premium Sections — Dark blue glassy aesthetic
 *
 * Design system:
 *   Page bg:     #070b18 (deep navy)
 *   Section alt: #0a1020 (slightly lighter navy)
 *   Cards:       bg-white/[0.03] backdrop-blur-xl border-white/[0.06]
 *   Accent:      emerald (#37bd7e) for CTAs, blue-400 for info labels
 *   Glow:        radial-gradient blue at 6% opacity
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  ArrowRight, Globe, Check, Mail, Calendar, Target, Search,
  FileText, Activity, Clock, TrendingUp, AlertTriangle, Zap,
  Users, DollarSign,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ConfettiService } from '../../lib/services/confettiService';

// ─── Animation ───────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

// ═════════════════════════════════════════════════════════════
//  HERO
// ═════════════════════════════════════════════════════════════

const exampleDomains = ['stripe.com', 'notion.com', 'linear.app', 'figma.com'];

export function HeroV18({ onTryDemo }: { onTryDemo: (url: string) => void }) {
  const [demoUrl, setDemoUrl] = useState('');

  const handleDemoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (demoUrl.trim()) {
      ConfettiService.subtle();
      setTimeout(() => onTryDemo(demoUrl.trim()), 200);
    }
  };

  const handleExampleClick = (domain: string) => {
    setDemoUrl(domain);
    ConfettiService.subtle();
    setTimeout(() => onTryDemo(domain), 200);
  };

  return (
    <section className="relative min-h-[100dvh] flex flex-col bg-white dark:bg-[#070b18] overflow-hidden">
      {/* Blue radial glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3
          w-[600px] sm:w-[900px] h-[500px] sm:h-[700px] rounded-full pointer-events-none
          bg-[radial-gradient(ellipse,rgba(59,130,246,0.06),transparent_70%)] dark:bg-[radial-gradient(ellipse,rgba(59,130,246,0.12),transparent_70%)]
          blur-3xl"
        aria-hidden="true"
      />

      {/* Grid lines */}
      <div
        className="absolute inset-0 pointer-events-none
          bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)]
          bg-[size:72px_72px]
          [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,black_30%,transparent_100%)]"
        aria-hidden="true"
      />

      <div className="relative flex-1 flex items-center justify-center max-w-6xl mx-auto px-5 sm:px-6 py-20">
        <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col items-center text-center">
          <motion.h1 variants={fadeUp}
            className="font-display font-extrabold text-5xl md:text-7xl tracking-tight text-gray-900 dark:text-white leading-[1.08]">
            Everything before and<br />after the call
          </motion.h1>

          <motion.p variants={fadeUp}
            className="mt-4 sm:mt-6 text-gray-500 dark:text-gray-400 text-base sm:text-xl font-body max-w-2xl leading-relaxed">
            60 is the AI command center for sales. Follow-ups, meeting prep,
            pipeline hygiene — handled before you think about it.
          </motion.p>

          <motion.form variants={fadeUp} onSubmit={handleDemoSubmit}
            className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3 w-full max-w-lg mx-auto">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
                placeholder="yourcompany.com"
                className="w-full pl-10 pr-4 py-3 rounded-lg border text-sm font-body
                  bg-gray-100 border-gray-200 text-gray-900 placeholder:text-gray-400
                  dark:bg-white/[0.04] dark:border-white/[0.08] dark:text-white dark:placeholder:text-gray-500
                  focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-[#37bd7e] focus:border-transparent dark:focus:bg-white/[0.06]
                  backdrop-blur-sm transition-all"
              />
            </div>
            <button type="submit"
              className="px-6 py-3 rounded-lg text-sm font-semibold
                bg-blue-500 text-white hover:bg-blue-600 dark:bg-[#37bd7e] dark:hover:bg-[#2ea86d]
                transition-all hover:translate-y-[-1px] hover:shadow-lg hover:shadow-blue-500/20 dark:hover:shadow-[#37bd7e]/20
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-[#37bd7e] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#070b18]
                flex items-center justify-center gap-2">
              Try the demo
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.form>

          <motion.div variants={fadeUp} className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-gray-500">Try:</span>
            {exampleDomains.map((domain) => (
              <button key={domain} type="button" onClick={() => handleExampleClick(domain)}
                className="px-2.5 py-1 rounded-md text-xs font-medium border
                  border-gray-200 text-gray-500 dark:border-white/[0.08] dark:text-gray-400 hover:border-blue-500/30 hover:text-blue-500 dark:hover:border-[#37bd7e]/30 dark:hover:text-[#37bd7e]
                  transition-colors backdrop-blur-sm">
                {domain}
              </button>
            ))}
          </motion.div>

          <motion.div variants={fadeUp}
            className="mt-6 flex items-center justify-center gap-6 text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-blue-500 dark:text-[#37bd7e]" /> No signup required</span>
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-blue-500 dark:text-[#37bd7e]" /> 30-second setup</span>
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-blue-500 dark:text-[#37bd7e]" /> No credit card required</span>
          </motion.div>

        </motion.div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════
//  LOGO BAR
// ═════════════════════════════════════════════════════════════

const LOGOS = [
  { name: 'HubSpot', domain: 'hubspot.com' },
  { name: 'Slack', domain: 'slack.com' },
  { name: 'Google', domain: 'google.com' },
  { name: 'Fathom', domain: 'fathom.video' },
  { name: 'Apollo', domain: 'apollo.io' },
  { name: 'Instantly', domain: 'instantly.ai' },
  { name: 'Attio', domain: 'attio.com' },
  { name: 'Stripe', domain: 'stripe.com' },
];

export function LogoBarV18() {
  return (
    <section className="bg-gray-50 dark:bg-[#070b18] py-16 border-b border-gray-200 dark:border-white/[0.04]">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-6xl mx-auto px-6"
      >
        <p className="text-center text-sm font-medium text-gray-500 mb-10">
          Trusted by growing sales teams to build pipeline faster
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {LOGOS.map((logo) => (
            <img
              key={logo.name}
              src={`https://img.logo.dev/${logo.domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=64&format=png`}
              alt={logo.name}
              className="h-6 md:h-7 w-auto opacity-40 hover:opacity-70 dark:opacity-25 dark:hover:opacity-50 transition-opacity grayscale"
              loading="lazy"
            />
          ))}
        </div>
      </motion.div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════
//  BENEFITS
// ═════════════════════════════════════════════════════════════

const BENEFIT_DURATION = 5000;

interface Benefit { id: string; icon: LucideIcon; headline: string; description: string; bullets: string[] }

const BENEFITS: Benefit[] = [
  { id: 'followups', icon: Mail, headline: 'Never miss a follow-up', description: '8 types of follow-up — post-meeting recaps, no-show recovery, renewal reminders — all drafted in your voice and sent at the right time.', bullets: ['Auto-drafted within minutes of every meeting', 'Adapts tone and context per deal stage', 'Sent via email or Slack — wherever you work'] },
  { id: 'meetings', icon: Calendar, headline: 'Walk into every meeting prepared', description: 'Stakeholder history, talking points, competitor intel, and risk flags — delivered to Slack 2 hours before every call.', bullets: ['Briefs auto-generated from CRM + email context', 'Talking points tailored to each attendee', 'Delivered to Slack so you never miss them'] },
  { id: 'deals', icon: Target, headline: 'Know which deals need attention', description: 'Health scoring, slippage alerts, and rescue plans — 60 watches every deal and flags before you notice.', bullets: ['AI health score updated after every interaction', 'Slippage alerts before deals go cold', 'Suggested next best action for every deal'] },
  { id: 'prospecting', icon: Search, headline: 'Find the right prospects instantly', description: 'Company research, decision-maker search, and ICP matching — across Apollo, AI Ark, Explorium, and Apify.', bullets: ['Search 150M+ profiles with natural language', 'Auto-enrich with email, phone, and LinkedIn', 'ICP matching and lookalike company discovery'] },
  { id: 'proposals', icon: FileText, headline: 'Close faster with instant proposals', description: 'Proposals generated from deal context, meeting transcripts, and your brand styling — ready to send in seconds.', bullets: ['Auto-pulls from meetings and deal history', 'Custom pricing, timelines, and scope', 'One-click send as branded PDF'] },
  { id: 'pipeline', icon: Activity, headline: 'Pipeline that runs itself', description: 'Stale deal detection, missing next steps, automatic stage updates — your CRM stays current without you touching it.', bullets: ['Stale deals flagged and re-engaged automatically', 'Missing next steps detected and filled', 'Weekly hygiene digest with focus tasks'] },
];

function FollowUpIllustration() {
  const items = ['Post-meeting recap', 'No-show recovery', 'Renewal reminder', 'Re-engagement'];
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <motion.div key={item} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.15, duration: 0.3 }}
          className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-100 border border-gray-200 dark:bg-white/[0.04] dark:border-white/[0.06] backdrop-blur-sm">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-sm text-gray-600 dark:text-gray-300">{item}</span>
          <span className="ml-auto text-[10px] text-emerald-400 font-medium">Sent</span>
        </motion.div>
      ))}
    </div>
  );
}

function MeetingPrepIllustration() {
  return (
    <div className="space-y-3">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="p-3 rounded-lg bg-gray-100 border border-gray-200 dark:bg-white/[0.04] dark:border-white/[0.06] backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Delivered 2hrs before</span>
        </div>
        <div className="space-y-1.5">
          {['Stakeholder context', 'Talking points', 'Risk flags'].map((item, i) => (
            <motion.div key={item} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.2 }}
              className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">{item}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#4A154B]/15 border border-[#4A154B]/20">
        <Users className="w-3.5 h-3.5 text-[#E01E5A]" />
        <span className="text-xs text-gray-500 dark:text-gray-400">Sent to #sales-prep in Slack</span>
      </motion.div>
    </div>
  );
}

function DealHealthIllustration() {
  return (
    <div className="space-y-3">
      {[
        { name: 'Campium', score: 87, color: 'emerald' as const },
        { name: 'DataForge', score: 62, color: 'amber' as const },
        { name: 'NeuralPath', score: 34, color: 'red' as const },
      ].map((deal, i) => (
        <motion.div key={deal.name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.15 }}
          className="p-3 rounded-lg bg-gray-100 border border-gray-200 dark:bg-white/[0.04] dark:border-white/[0.06] backdrop-blur-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{deal.name}</span>
            <span className={`text-xs font-semibold ${deal.color === 'emerald' ? 'text-emerald-400' : deal.color === 'amber' ? 'text-amber-400' : 'text-red-400'}`}>
              {deal.score}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-white/[0.06] overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${deal.color === 'emerald' ? 'bg-emerald-500' : deal.color === 'amber' ? 'bg-amber-500' : 'bg-red-500'}`}
              initial={{ width: '0%' }} animate={{ width: `${deal.score}%` }}
              transition={{ duration: 0.8, delay: i * 0.15 + 0.2 }}
            />
          </div>
          {deal.score < 50 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.15 + 0.6 }}
              className="flex items-center gap-1.5 mt-2">
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span className="text-[10px] text-red-400">At risk — rescue plan ready</span>
            </motion.div>
          )}
        </motion.div>
      ))}
    </div>
  );
}

function ProspectingIllustration() {
  const sources = [
    { name: 'Apollo', count: '23', color: 'text-blue-400' },
    { name: 'AI Ark', count: '12', color: 'text-purple-400' },
    { name: 'Explorium', count: '8', color: 'text-emerald-400' },
  ];
  return (
    <div className="space-y-3">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 border border-gray-200 dark:bg-white/[0.04] dark:border-white/[0.06] backdrop-blur-sm">
        <Search className="w-4 h-4 text-gray-500" />
        <span className="text-xs text-gray-500 font-mono">SaaS · Series A · New York</span>
      </motion.div>
      <div className="flex gap-2">
        {sources.map((source, i) => (
          <motion.div key={source.name} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 + i * 0.15 }}
            className="flex-1 p-2.5 rounded-lg bg-gray-100 border border-gray-200 dark:bg-white/[0.04] dark:border-white/[0.06] backdrop-blur-sm text-center">
            <p className={`text-lg font-bold ${source.color}`}>{source.count}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{source.name}</p>
          </motion.div>
        ))}
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
        className="flex items-center gap-1.5 text-xs text-emerald-400">
        <Zap className="w-3.5 h-3.5" />
        <span className="font-medium">43 contacts enriched with email + phone</span>
      </motion.div>
    </div>
  );
}

function ProposalIllustration() {
  return (
    <div className="space-y-2">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-lg bg-gray-100 border border-gray-200 dark:bg-white/[0.04] dark:border-white/[0.06] backdrop-blur-sm overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-200 dark:border-white/[0.06] flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Proposal — Campium</span>
        </div>
        <div className="p-3 space-y-2">
          {['Executive Summary', 'Solution', 'Investment: $18,000/yr'].map((section, i) => (
            <motion.div key={section} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 + i * 0.2 }}
              className="flex items-center gap-2">
              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="text-xs text-gray-500 dark:text-gray-400">{section}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
        className="flex items-center gap-1.5 text-xs text-blue-400">
        <TrendingUp className="w-3.5 h-3.5" />
        <span className="font-medium">Generated in 30 seconds from deal context</span>
      </motion.div>
    </div>
  );
}

function PipelineIllustration() {
  const tasks = [
    { label: 'Stale deals flagged', count: 3, done: true },
    { label: 'Missing next steps filled', count: 7, done: true },
    { label: 'Stages updated', count: 4, done: true },
    { label: 'Focus tasks generated', count: 5, done: false },
  ];
  return (
    <div className="space-y-2">
      {tasks.map((task, i) => (
        <motion.div key={task.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.15 }}
          className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-100 border border-gray-200 dark:bg-white/[0.04] dark:border-white/[0.06] backdrop-blur-sm">
          {task.done ? (
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <div className="w-4 h-4 rounded border-2 border-gray-300 dark:border-gray-600 shrink-0" />
          )}
          <span className="text-sm text-gray-600 dark:text-gray-300 flex-1">{task.label}</span>
          <span className="text-xs font-medium text-gray-500">{task.count}</span>
        </motion.div>
      ))}
    </div>
  );
}

const ILLUSTRATIONS = [FollowUpIllustration, MeetingPrepIllustration, DealHealthIllustration, ProspectingIllustration, ProposalIllustration, PipelineIllustration];

export function BenefitsV18() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const isPaused = useRef(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: false, margin: '-100px' });

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
  const ActiveIllustration = ILLUSTRATIONS[activeIndex];

  return (
    <section ref={sectionRef} className="bg-white dark:bg-[#070b18] py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-12 md:mb-16">
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-4 tracking-wide uppercase">Why teams choose 60</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            Stop doing sales admin. Start closing deals.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            Every feature is designed around one question: does this help you close faster?
          </p>
        </motion.div>

        {/* Tabs */}
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
                    <motion.div layoutId="benefit-tab-v18"
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
            <motion.div
              key={`bp-${progressKey}`}
              className="h-full rounded-full bg-blue-500 dark:bg-[#37bd7e]"
              initial={{ width: '0%' }}
              animate={{ width: isHovered ? undefined : '100%' }}
              transition={{ duration: BENEFIT_DURATION / 1000, ease: 'linear' }}
            />
          </div>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div key={activeBenefit.id}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-start">
            <div className="space-y-5">
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
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-200 dark:bg-white/[0.03] dark:border-white/[0.06] backdrop-blur-sm p-5 sm:p-6 min-h-[260px]">
              <ActiveIllustration />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════
//  INTEGRATIONS
// ═════════════════════════════════════════════════════════════

interface Integration { name: string; domain: string; description: string; category: string; comingSoon?: boolean }

const INTEGRATIONS: Integration[] = [
  { name: 'HubSpot', domain: 'hubspot.com', description: 'Bi-directional sync — deals, contacts, activities', category: 'CRM' },
  { name: 'Attio', domain: 'attio.com', description: 'Native integration with field mapping', category: 'CRM' },
  { name: 'Bullhorn', domain: 'bullhorn.com', description: 'ATS integration for recruitment teams', category: 'CRM' },
  { name: 'Slack', domain: 'slack.com', description: 'Briefs, alerts, approvals, copilot — 60 lives here', category: 'Communication' },
  { name: 'Google Workspace', domain: 'google.com', description: 'Gmail, Calendar, Drive, Docs — full workspace sync', category: 'Productivity' },
  { name: 'Outlook', domain: 'outlook.com', description: 'Email and calendar integration', category: 'Email' },
  { name: 'Fathom', domain: 'fathom.video', description: 'Transcription, speaker ID, semantic search', category: 'Meetings' },
  { name: 'Apollo', domain: 'apollo.io', description: 'Lead search, company enrichment, email finder', category: 'Data' },
  { name: 'AI Ark', domain: 'ai-ark.com', description: 'Semantic company search and lookalike discovery', category: 'Data' },
  { name: 'Explorium', domain: 'explorium.ai', description: '80M+ business database with intent signals', category: 'Data' },
  { name: 'Apify', domain: 'apify.com', description: 'Web scraping and automated data collection', category: 'Data' },
  { name: 'Instantly', domain: 'instantly.ai', description: 'Cold email campaigns, tracking, replies', category: 'Outreach' },
  { name: 'LinkedIn', domain: 'linkedin.com', description: 'Profile enrichment and connection tracking', category: 'Outreach' },
  { name: 'Stripe', domain: 'stripe.com', description: 'Billing, subscriptions, payment tracking', category: 'Billing' },
  { name: 'JustCall', domain: 'justcall.io', description: 'Phone calls, SMS, and call tracking', category: 'Phone' },
  { name: 'Better Contact', domain: 'bettercontact.rocks', description: 'Waterfall enrichment across 20+ data providers', category: 'Data' },
  { name: 'HeyReach', domain: 'heyreach.io', description: 'LinkedIn outreach automation at scale', category: 'Outreach' },
];

const LOGO_OVERRIDES: Record<string, string> = {
  'outlook.com': 'https://cdn-dynmedia-1.microsoft.com/is/image/microsoftcorp/Outlook-m365-apps?fmt=png-alpha&wid=128',
};

function IntegrationLogo({ domain, name }: { domain: string; name: string }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const url = LOGO_OVERRIDES[domain] || `https://img.logo.dev/${domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=128&format=png`;
  return (
    <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center shrink-0">
      {!errored ? (
        <img src={url} alt={`${name} logo`} width={40} height={40}
          className={`w-full h-full object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)} onError={() => setErrored(true)} />
      ) : (
        <span className="text-sm font-bold text-gray-500">{name.charAt(0)}</span>
      )}
    </div>
  );
}

export function IntegrationsV18() {
  return (
    <section className="bg-gray-50 dark:bg-[#0a1020] py-24 md:py-32" id="integrations">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-16">
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-4 tracking-wide uppercase">Integrations</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            Connects to everything. Controls everything.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            60 doesn't just integrate — it orchestrates. Your CRM, email, calendar, and outreach tools
            all flow through one command center. Keep your stack. Add the brain.
          </p>
        </motion.div>

        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {INTEGRATIONS.map((integration) => (
            <motion.div key={integration.name} variants={fadeUp}
              className="group relative bg-white border border-gray-200 dark:bg-white/[0.03] dark:border-white/[0.06] rounded-xl p-5
                hover:bg-gray-50 hover:border-gray-300 dark:hover:bg-white/[0.06] dark:hover:border-white/[0.1] transition-all backdrop-blur-sm shadow-sm dark:shadow-none">
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <IntegrationLogo domain={integration.domain} name={integration.name} />
                  {integration.comingSoon && (
                    <span className="text-[10px] font-medium leading-none text-amber-400 bg-amber-500/10 rounded-full px-2 py-1 whitespace-nowrap">
                      Soon
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{integration.name}</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{integration.description}</p>
                </div>
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{integration.category}</span>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.p variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mt-10 text-sm text-gray-500 font-body">
          Don't see your tool? We build custom integrations in 48 hours.
        </motion.p>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════
//  STATS
// ═════════════════════════════════════════════════════════════

interface StatDef { icon: LucideIcon; target: number; suffix: string; prefix: string; label: string }

const STATS: StatDef[] = [
  { icon: Clock, target: 15, suffix: '+', prefix: '', label: 'hours saved per rep, per week' },
  { icon: Zap, target: 48, suffix: '', prefix: '', label: 'hours to go live' },
  { icon: TrendingUp, target: 94, suffix: '%', prefix: '', label: 'follow-up rate (vs 40% industry avg)' },
  { icon: DollarSign, target: 255, suffix: 'K+', prefix: '$', label: 'saved vs. hiring' },
];

function StatCountUp({ target, isInView }: { target: number; isInView: boolean }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!isInView) return;
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
  }, [isInView, target]);
  return <>{count}</>;
}

export function StatsV18() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="bg-gray-50 dark:bg-[#0a1020] py-16">
      <div ref={ref} className="max-w-4xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {STATS.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: i * 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="text-center">
                <div className="flex justify-center mb-3">
                  <div className="w-10 h-10 bg-gray-100 border border-gray-200 dark:bg-white/[0.04] dark:border-white/[0.08] rounded-xl flex items-center justify-center backdrop-blur-sm">
                    <Icon className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
                <div className="text-3xl md:text-4xl font-display font-bold text-blue-500 dark:text-[#37bd7e] tabular-nums">
                  {stat.prefix}<StatCountUp target={stat.target} isInView={isInView} />{stat.suffix}
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 font-body">{stat.label}</div>
              </motion.div>
            );
          })}
        </div>
        <p className="text-center text-xs text-gray-500 mt-6">Based on teams using 60 for 30+ days</p>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════
//  TESTIMONIALS
// ═════════════════════════════════════════════════════════════

const TESTIMONIALS = [
  { quote: "We were spending 3 hours a day on meeting prep and follow-ups. 60 cut that to minutes. It's not a tool — it's a teammate.", author: 'Rachel M.', role: 'Account Executive, B2B SaaS (12-person team)' },
  { quote: "I was about to hire a sales leader for $120K. Instead we invested in 60. Three months later, pipeline is 3x and we didn't add a single person.", author: 'Grace E.', role: 'COO, Financial Services ($7M revenue)' },
  { quote: "The command center changed everything. Voice command to find leads, enrich them, write sequences, and push to LinkedIn — all in one screen. My head nearly exploded.", author: 'David L.', role: 'VP Sales, 40-person sales org' },
  { quote: "We tried Clay, Apollo, and three other tools. 60 is the only one that actually does the work instead of just showing you data.", author: 'Sarah T.', role: 'Head of Revenue, Growth-stage SaaS' },
];

export function TestimonialsV18() {
  return (
    <section className="bg-white dark:bg-[#070b18] py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-16">
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-4 tracking-wide uppercase">From early users</p>
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
              <p className="text-gray-600 dark:text-gray-300 text-base leading-relaxed font-body mb-6 italic">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm">{t.author}</p>
                <p className="text-gray-500 text-sm">{t.role}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════
//  FINAL CTA
// ═════════════════════════════════════════════════════════════

export function CTAV18() {
  const ref = useRef<HTMLAnchorElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setOffset({ x: (e.clientX - rect.left - rect.width / 2) * 0.3, y: (e.clientY - rect.top - rect.height / 2) * 0.3 });
  }, []);

  return (
    <section className="relative bg-gray-50 dark:bg-[#0a1020] py-24 md:py-32 overflow-hidden">
      {/* Glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.06] blur-[120px] bg-blue-500 dark:bg-[#37bd7e]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-w-2xl mx-auto px-6 text-center">
        <h2 className="font-display font-bold text-3xl md:text-5xl text-gray-900 dark:text-white tracking-tight">
          Your AI sales team is ready
        </h2>
        <p className="mt-6 text-gray-500 dark:text-gray-400 text-lg font-body">
          Stop paying for tools that don&apos;t talk to each other. Start with the command center that does everything.
        </p>

        <div className="mt-10" onMouseMove={handleMouseMove} onMouseLeave={() => setOffset({ x: 0, y: 0 })}>
          <motion.a
            ref={ref}
            href="https://app.use60.com/auth/signup"
            animate={{ x: offset.x, y: offset.y }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, mass: 0.5 }}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-semibold
              bg-blue-500 text-white hover:bg-blue-600 dark:bg-[#37bd7e] dark:hover:bg-[#2ea86d]
              transition-colors hover:shadow-lg hover:shadow-blue-500/25 dark:hover:shadow-[#37bd7e]/25
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-[#37bd7e] focus-visible:ring-offset-2 focus-visible:ring-offset-gray-50 dark:focus-visible:ring-offset-[#0a1020]">
            Get Started
            <ArrowRight className="w-5 h-5" />
          </motion.a>
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

// ═════════════════════════════════════════════════════════════
//  FOOTER
// ═════════════════════════════════════════════════════════════

const FOOTER_LINKS = {
  Product: [
    { label: 'Features', href: '#features' },
    { label: 'Integrations', href: '#integrations' },
    { label: 'Pricing', href: '/pricing' },
  ],
  Company: [
    { label: 'About', href: '#' },
    { label: 'Blog', href: '#' },
    { label: 'Careers', href: '#' },
  ],
  Resources: [
    { label: 'Documentation', href: '#' },
    { label: 'Changelog', href: '#' },
    { label: 'Status', href: '#' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy-policy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
};

export function FooterV18() {
  return (
    <footer className="bg-gray-100 dark:bg-[#050810] text-gray-500 dark:text-gray-400 py-16 md:py-20 border-t border-gray-200 dark:border-white/[0.04]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-12">
          <div className="col-span-2 md:col-span-1">
            <a href="/" className="inline-block">
              <img src="https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png" alt="60" className="h-8 w-auto" />
            </a>
            <p className="mt-3 text-sm text-gray-500 leading-relaxed">
              The AI command center for sales. Everything before and after the call.
            </p>
          </div>
          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <h4 className="font-medium text-gray-900 dark:text-white text-sm mb-4">{category}</h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 pt-8 border-t border-gray-200 dark:border-white/[0.04]">
          <p className="text-sm text-gray-400 dark:text-gray-600 text-center">&copy; {new Date().getFullYear()} Sixty Seconds. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

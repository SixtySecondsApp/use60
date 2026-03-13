/**
 * BenefitsSectionV14 — Benefits-focused feature showcase
 *
 * Replaces 5 redundant sections (FeatureNarrative, ShowcaseTabs, FeatureGrid, etc.)
 * Horizontal tabs at top, content panel below with benefit copy + mini illustration.
 * Auto-cycles through benefits. Click to lock on one.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  Mail, Calendar, Target, Search, FileText, Activity,
  Check, Clock, TrendingUp, AlertTriangle, Zap, Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────

const BENEFIT_DURATION = 5000;

interface Benefit {
  id: string;
  icon: LucideIcon;
  headline: string;
  description: string;
  bullets: string[];
}

const BENEFITS: Benefit[] = [
  {
    id: 'followups',
    icon: Mail,
    headline: 'Never miss a follow-up',
    description: '8 types of follow-up — post-meeting recaps, no-show recovery, renewal reminders — all drafted in your voice and sent at the right time.',
    bullets: [
      'Auto-drafted within minutes of every meeting',
      'Adapts tone and context per deal stage',
      'Sent via email or Slack — wherever you work',
    ],
  },
  {
    id: 'meetings',
    icon: Calendar,
    headline: 'Walk into every meeting prepared',
    description: 'Stakeholder history, talking points, competitor intel, and risk flags — delivered to Slack 2 hours before every call.',
    bullets: [
      'Briefs auto-generated from CRM + email context',
      'Talking points tailored to each attendee',
      'Delivered to Slack so you never miss them',
    ],
  },
  {
    id: 'deals',
    icon: Target,
    headline: 'Know which deals need attention',
    description: 'Health scoring, slippage alerts, and rescue plans — 60 watches every deal and flags before you notice.',
    bullets: [
      'AI health score updated after every interaction',
      'Slippage alerts before deals go cold',
      'Suggested next best action for every deal',
    ],
  },
  {
    id: 'prospecting',
    icon: Search,
    headline: 'Find the right prospects instantly',
    description: 'Company research, decision-maker search, and ICP matching — across Apollo, AI Ark, Explorium, and Apify.',
    bullets: [
      'Search 150M+ profiles with natural language',
      'Auto-enrich with email, phone, and LinkedIn',
      'ICP matching and lookalike company discovery',
    ],
  },
  {
    id: 'proposals',
    icon: FileText,
    headline: 'Close faster with instant proposals',
    description: 'Proposals generated from deal context, meeting transcripts, and your brand styling — ready to send in seconds.',
    bullets: [
      'Auto-pulls from meetings and deal history',
      'Custom pricing, timelines, and scope',
      'One-click send as branded PDF',
    ],
  },
  {
    id: 'pipeline',
    icon: Activity,
    headline: 'Pipeline that runs itself',
    description: 'Stale deal detection, missing next steps, automatic stage updates — your CRM stays current without you touching it.',
    bullets: [
      'Stale deals flagged and re-engaged automatically',
      'Missing next steps detected and filled',
      'Weekly hygiene digest with focus tasks',
    ],
  },
];

// ─── Animation ──────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

// ─── Benefit Illustrations ──────────────────────────────────

function FollowUpIllustration() {
  const items = ['Post-meeting recap', 'No-show recovery', 'Renewal reminder', 'Re-engagement'];
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <motion.div
          key={item}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.15, duration: 0.3 }}
          className="flex items-center gap-3 p-2.5 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06]"
        >
          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-sm text-gray-700 dark:text-gray-300">{item}</span>
          <span className="ml-auto text-[10px] text-emerald-500 font-medium">Sent</span>
        </motion.div>
      ))}
    </div>
  );
}

function MeetingPrepIllustration() {
  return (
    <div className="space-y-3">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-3 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06]"
      >
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Delivered 2hrs before</span>
        </div>
        <div className="space-y-1.5">
          {['Stakeholder context', 'Talking points', 'Risk flags'].map((item, i) => (
            <motion.div
              key={item}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.2 }}
              className="flex items-center gap-2"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">{item}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#4A154B]/5 dark:bg-[#4A154B]/10 border border-[#4A154B]/10 dark:border-[#4A154B]/20"
      >
        <Users className="w-3.5 h-3.5 text-[#E01E5A]" />
        <span className="text-xs text-gray-600 dark:text-gray-400">Sent to #sales-prep in Slack</span>
      </motion.div>
    </div>
  );
}

function DealHealthIllustration() {
  return (
    <div className="space-y-3">
      {[
        { name: 'MicroQuant', score: 87, color: 'emerald' },
        { name: 'DataForge', score: 62, color: 'amber' },
        { name: 'NeuralPath', score: 34, color: 'red' },
      ].map((deal, i) => (
        <motion.div
          key={deal.name}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.15 }}
          className="p-3 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06]"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{deal.name}</span>
            <span className={`text-xs font-semibold ${
              deal.color === 'emerald' ? 'text-emerald-500' :
              deal.color === 'amber' ? 'text-amber-500' : 'text-red-500'
            }`}>
              {deal.score}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                deal.color === 'emerald' ? 'bg-emerald-500' :
                deal.color === 'amber' ? 'bg-amber-500' : 'bg-red-500'
              }`}
              initial={{ width: '0%' }}
              animate={{ width: `${deal.score}%` }}
              transition={{ duration: 0.8, delay: i * 0.15 + 0.2 }}
            />
          </div>
          {deal.score < 50 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.15 + 0.6 }}
              className="flex items-center gap-1.5 mt-2"
            >
              <AlertTriangle className="w-3 h-3 text-red-500" />
              <span className="text-[10px] text-red-500">At risk — rescue plan ready</span>
            </motion.div>
          )}
        </motion.div>
      ))}
    </div>
  );
}

function ProspectingIllustration() {
  const sources = [
    { name: 'Apollo', count: '23', color: 'blue' },
    { name: 'AI Ark', count: '12', color: 'purple' },
    { name: 'Explorium', count: '8', color: 'emerald' },
  ];
  return (
    <div className="space-y-3">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06]"
      >
        <Search className="w-4 h-4 text-gray-400" />
        <span className="text-xs text-gray-500 font-mono">SaaS · Series A · New York</span>
      </motion.div>
      <div className="flex gap-2">
        {sources.map((source, i) => (
          <motion.div
            key={source.name}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 + i * 0.15 }}
            className="flex-1 p-2.5 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06] text-center"
          >
            <p className={`text-lg font-bold ${
              source.color === 'blue' ? 'text-blue-500' :
              source.color === 'purple' ? 'text-purple-500' : 'text-emerald-500'
            }`}>
              {source.count}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">{source.name}</p>
          </motion.div>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="flex items-center gap-1.5 text-xs text-emerald-500"
      >
        <Zap className="w-3.5 h-3.5" />
        <span className="font-medium">43 contacts enriched with email + phone</span>
      </motion.div>
    </div>
  );
}

function ProposalIllustration() {
  return (
    <div className="space-y-2">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06] overflow-hidden"
      >
        <div className="px-3 py-2 border-b border-gray-100 dark:border-white/[0.06] flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Proposal — MicroQuant</span>
        </div>
        <div className="p-3 space-y-2">
          {['Executive Summary', 'Solution', 'Investment: $18,000/yr'].map((section, i) => (
            <motion.div
              key={section}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 + i * 0.2 }}
              className="flex items-center gap-2"
            >
              <Check className="w-3 h-3 text-emerald-500 shrink-0" />
              <span className="text-xs text-gray-500 dark:text-gray-400">{section}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="flex items-center gap-1.5 text-xs text-blue-500"
      >
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
        <motion.div
          key={task.label}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.15 }}
          className="flex items-center gap-3 p-2.5 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06]"
        >
          {task.done ? (
            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : (
            <div className="w-4 h-4 rounded border-2 border-gray-300 dark:border-gray-600 shrink-0" />
          )}
          <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{task.label}</span>
          <span className="text-xs font-medium text-gray-400">{task.count}</span>
        </motion.div>
      ))}
    </div>
  );
}

const ILLUSTRATIONS = [
  FollowUpIllustration,
  MeetingPrepIllustration,
  DealHealthIllustration,
  ProspectingIllustration,
  ProposalIllustration,
  PipelineIllustration,
];

// ─── Main Component ─────────────────────────────────────────

export function BenefitsSectionV14() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const isPaused = useRef(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: false, margin: '-100px' });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || !isInView) return;
    const id = setInterval(() => {
      if (!isPaused.current) {
        setActiveIndex((i) => (i + 1) % BENEFITS.length);
        setProgressKey((k) => k + 1);
      }
    }, BENEFIT_DURATION);
    return () => clearInterval(id);
  }, [prefersReducedMotion, isInView]);

  const handleSelect = useCallback((index: number) => {
    setActiveIndex(index);
    setProgressKey((k) => k + 1);
  }, []);

  const handleMouseEnter = useCallback(() => {
    isPaused.current = true;
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    isPaused.current = false;
    setIsHovered(false);
  }, []);

  const activeBenefit = BENEFITS[activeIndex];
  const ActiveIllustration = ILLUSTRATIONS[activeIndex];

  return (
    <section ref={sectionRef} className="bg-white dark:bg-[#0a0a0a] py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-12 md:mb-16"
        >
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-500 mb-4 tracking-wide uppercase">
            Why teams choose 60
          </p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            Stop doing sales admin. Start closing deals.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            Every feature is designed around one question: does this help you close faster?
          </p>
        </motion.div>

        {/* Tabs */}
        <div
          className="mb-8"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Mobile: scrollable pills */}
          <div className="flex md:hidden gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {BENEFITS.map((benefit, i) => {
              const Icon = benefit.icon;
              const active = i === activeIndex;
              return (
                <button
                  key={benefit.id}
                  onClick={() => handleSelect(i)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? 'bg-blue-50 dark:bg-emerald-500/10 text-blue-600 dark:text-emerald-400 border border-blue-200 dark:border-emerald-500/20'
                      : 'text-gray-500 dark:text-gray-400 border border-transparent hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {benefit.headline.replace(/^(Never|Walk|Know|Find|Close|Pipeline) /, '')}
                </button>
              );
            })}
          </div>

          {/* Desktop: full tab bar */}
          <div className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-gray-100 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06]">
            {BENEFITS.map((benefit, i) => {
              const Icon = benefit.icon;
              const active = i === activeIndex;
              return (
                <button
                  key={benefit.id}
                  onClick={() => handleSelect(i)}
                  className={`relative flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="benefit-tab-v14"
                      className="absolute inset-0 bg-white dark:bg-white/10 rounded-lg shadow-sm"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">{benefit.headline.split(' ').slice(0, 3).join(' ')}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1 rounded-full bg-gray-100 dark:bg-white/[0.04] overflow-hidden">
            <motion.div
              key={`benefit-progress-${progressKey}`}
              className="h-full rounded-full bg-blue-600 dark:bg-emerald-500"
              initial={{ width: '0%' }}
              animate={{ width: isHovered ? undefined : '100%' }}
              transition={{ duration: BENEFIT_DURATION / 1000, ease: 'linear' }}
            />
          </div>
        </div>

        {/* Content panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeBenefit.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-start"
          >
            {/* Left: Copy */}
            <div className="space-y-5">
              <div>
                <h3 className="font-display font-bold text-2xl md:text-3xl text-gray-900 dark:text-white mb-3">
                  {activeBenefit.headline}
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-base font-body leading-relaxed">
                  {activeBenefit.description}
                </p>
              </div>

              <ul className="space-y-3">
                {activeBenefit.bullets.map((bullet, i) => (
                  <motion.li
                    key={bullet}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.1 }}
                    className="flex items-start gap-3"
                  >
                    <Check className="w-4 h-4 text-blue-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-600 dark:text-gray-300">{bullet}</span>
                  </motion.li>
                ))}
              </ul>
            </div>

            {/* Right: Illustration */}
            <div className="rounded-xl bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-white/[0.06] p-5 sm:p-6 min-h-[260px]">
              <ActiveIllustration />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

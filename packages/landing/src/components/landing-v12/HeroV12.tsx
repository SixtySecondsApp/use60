import { useState, useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Globe, Check, LayoutDashboard, Calendar, Mail, Users, Sparkles, Clock, TrendingUp, MessageSquare } from 'lucide-react';
import { AuroraBackground } from './AuroraBackground';
import { ConfettiService } from '../../lib/services/confettiService';

interface HeroV12Props {
  onTryDemo: (url: string) => void;
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const exampleDomains = ['stripe.com', 'notion.com', 'linear.app', 'figma.com'];

const SIDEBAR_ITEMS = [
  { icon: LayoutDashboard, label: 'Pipeline', active: true },
  { icon: Calendar, label: 'Meetings', active: false },
  { icon: Mail, label: 'Follow-ups', active: false },
  { icon: Users, label: 'Contacts', active: false },
  { icon: Sparkles, label: 'Copilot', active: false },
];

const DEAL_CARDS = [
  {
    company: 'TechCorp',
    stage: 'Discovery',
    value: '$120K',
    signal: 'Meeting tomorrow',
    signalColor: 'text-violet-400',
    signalBg: 'bg-violet-500/10',
  },
  {
    company: 'Acme Inc',
    stage: 'Proposal',
    value: '$85K',
    signal: 'Follow-up ready',
    signalColor: 'text-blue-400',
    signalBg: 'bg-blue-500/10',
  },
  {
    company: 'CloudBase',
    stage: 'Negotiation',
    value: '$200K',
    signal: 'Renewal in 14d',
    signalColor: 'text-amber-400',
    signalBg: 'bg-amber-500/10',
  },
];

const ACTIVITY_ITEMS = [
  { icon: Mail, text: 'Follow-up sent to Sarah Chen at TechCorp', time: '2m ago' },
  { icon: TrendingUp, text: 'Acme Inc deal moved to Proposal stage', time: '15m ago' },
  { icon: MessageSquare, text: 'Meeting notes synced from Fathom call', time: '1h ago' },
];

function PipelineMockup() {
  return (
    <div className="w-full rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gradient-to-b dark:from-violet-500/[0.07] dark:to-transparent shadow-2xl shadow-black/5 dark:shadow-black/30 overflow-hidden">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/50 dark:bg-white/[0.02]">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="px-4 py-1 rounded-md bg-gray-100 dark:bg-white/[0.05] text-[10px] text-gray-400 dark:text-[#8891b0] font-mono">
            app.use60.com
          </div>
        </div>
      </div>

      {/* App layout */}
      <div className="flex min-h-[320px] sm:min-h-[360px]">
        {/* Sidebar */}
        <div className="hidden sm:flex flex-col w-44 border-r border-gray-100 dark:border-white/[0.05] bg-gray-50/30 dark:bg-white/[0.01] py-3 px-2 gap-0.5">
          {SIDEBAR_ITEMS.map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                item.active
                  ? 'bg-gradient-to-r from-violet-600/10 to-blue-500/10 text-violet-600 dark:text-violet-400'
                  : 'text-gray-400 dark:text-[#8891b0]'
              }`}
            >
              <item.icon className="w-3.5 h-3.5" />
              {item.label}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 p-4 sm:p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-[#e1f0ff]">Pipeline Overview</h3>
              <p className="text-[11px] text-gray-400 dark:text-[#8891b0] mt-0.5">12 active deals &middot; $847K weighted</p>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
                <Sparkles className="w-2.5 h-2.5" /> AI
              </span>
            </div>
          </div>

          {/* Deal cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {DEAL_CARDS.map((deal) => (
              <div
                key={deal.company}
                className="rounded-xl border border-gray-100 dark:border-white/[0.08] bg-gray-50/50 dark:bg-white/[0.02] p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-900 dark:text-[#e1f0ff]">{deal.company}</span>
                  <span className="text-[10px] font-medium text-gray-400 dark:text-[#8891b0]">{deal.value}</span>
                </div>
                <div className="text-[10px] text-gray-400 dark:text-[#8891b0] mb-2">{deal.stage}</div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${deal.signalBg} ${deal.signalColor}`}>
                  <Clock className="w-2.5 h-2.5" />
                  {deal.signal}
                </span>
              </div>
            ))}
          </div>

          {/* Activity feed */}
          <div className="border-t border-gray-100 dark:border-white/[0.05] pt-3">
            <p className="text-[11px] font-medium text-gray-400 dark:text-[#8891b0] mb-2">Recent Activity</p>
            <div className="space-y-2">
              {ACTIVITY_ITEMS.map((item, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-md bg-gray-100 dark:bg-white/[0.05] flex items-center justify-center">
                    <item.icon className="w-2.5 h-2.5 text-gray-400 dark:text-[#8891b0]" />
                  </div>
                  <span className="text-[11px] text-gray-500 dark:text-[#8891b0] flex-1 truncate">{item.text}</span>
                  <span className="text-[10px] text-gray-300 dark:text-gray-600 flex-shrink-0">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroV12({ onTryDemo }: HeroV12Props) {
  const [demoUrl, setDemoUrl] = useState('');
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  // Parallax transforms for decorative bricks
  const brick1Y = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const brick2Y = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const brick3Y = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const brick4Y = useTransform(scrollYProgress, [0, 1], [0, -30]);

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
    <section ref={sectionRef} className="relative bg-white dark:bg-[#070b1a] overflow-hidden">
      <AuroraBackground />

      {/* Subtle decorative elements — parallax bricks with V12 accent colors */}
      <motion.div
        style={{ y: brick1Y }}
        className="absolute top-32 left-8 w-3 h-12 bg-violet-500/20 dark:bg-violet-500/10 rounded-sm hidden lg:block"
        aria-hidden="true"
      />
      <motion.div
        style={{ y: brick2Y }}
        className="absolute top-48 left-14 w-2 h-8 bg-gray-300/30 dark:bg-gray-500/10 rounded-sm hidden lg:block"
        aria-hidden="true"
      />
      <motion.div
        style={{ y: brick3Y }}
        className="absolute top-36 right-12 w-3 h-10 bg-blue-400/15 dark:bg-blue-400/10 rounded-sm hidden lg:block"
        aria-hidden="true"
      />
      <motion.div
        style={{ y: brick4Y }}
        className="absolute top-52 right-20 w-2 h-6 bg-gray-300/20 dark:bg-gray-500/[0.08] rounded-sm hidden lg:block"
        aria-hidden="true"
      />

      <div className="relative max-w-6xl mx-auto px-6 pt-28 pb-12 md:pt-36 md:pb-16">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="flex flex-col items-center text-center"
        >
          {/* Headline */}
          <motion.h1
            variants={fadeUp}
            className="font-display font-extrabold text-5xl md:text-7xl tracking-tight text-gray-900 dark:text-[#e1f0ff] leading-[1.08]"
          >
            Everything before and{' '}
            <span className="bg-gradient-to-r from-violet-600 to-blue-500 bg-clip-text text-transparent">
              after the call
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={fadeUp}
            className="mt-6 text-gray-600 dark:text-[#8891b0] text-xl font-body max-w-2xl leading-relaxed"
          >
            60 is the AI command center for sales. Meeting prep, follow-ups, pipeline hygiene,
            CRM updates — handled before you think about it.
          </motion.p>

          {/* CTA button */}
          <motion.div variants={fadeUp} className="mt-10">
            <button
              onClick={() => {
                const el = document.getElementById('demo-input');
                if (el) el.focus();
              }}
              className="px-8 py-3.5 rounded-lg text-base font-semibold
                bg-gradient-to-r from-violet-600 to-blue-500 text-white
                hover:shadow-[0_0_30px_-5px_rgba(124,58,237,0.5)] transition-all hover:translate-y-[-1px]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2
                dark:focus-visible:ring-offset-[#070b1a]
                flex items-center justify-center gap-2"
            >
              Try the demo
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>

          {/* Demo URL form */}
          <motion.form
            variants={fadeUp}
            onSubmit={handleDemoSubmit}
            className="mt-6 flex flex-col sm:flex-row gap-3 w-full max-w-md"
          >
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                id="demo-input"
                type="text"
                value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
                placeholder="yourcompany.com"
                className="w-full pl-10 pr-4 py-3 rounded-lg border text-sm font-body
                  bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400
                  focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent focus:bg-white
                  dark:bg-white/5 dark:border-white/[0.08] dark:text-[#e1f0ff] dark:placeholder:text-gray-500
                  dark:focus:bg-white/10 dark:focus:ring-violet-500
                  transition-all"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-3 rounded-lg text-sm font-semibold
                bg-gradient-to-r from-violet-600 to-blue-500 text-white
                hover:shadow-[0_0_30px_-5px_rgba(124,58,237,0.5)] transition-all hover:translate-y-[-1px]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2
                dark:focus-visible:ring-offset-[#070b1a]
                flex items-center justify-center gap-2"
            >
              Go
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.form>

          {/* Example domain buttons */}
          <motion.div
            variants={fadeUp}
            className="mt-3 flex flex-wrap items-center justify-center gap-2"
          >
            <span className="text-xs text-gray-400 dark:text-[#8891b0]">Try:</span>
            {exampleDomains.map((domain) => (
              <button
                key={domain}
                type="button"
                onClick={() => handleExampleClick(domain)}
                className="px-2.5 py-1 rounded-md text-xs font-medium border
                  border-gray-200 text-gray-500 hover:border-violet-300 hover:text-violet-600
                  dark:border-white/[0.08] dark:text-[#8891b0] dark:hover:border-violet-500/30 dark:hover:text-violet-400
                  transition-colors"
              >
                {domain}
              </button>
            ))}
          </motion.div>

          {/* Trust micro-copy */}
          <motion.div
            variants={fadeUp}
            className="mt-4 flex items-center justify-center gap-6 text-xs text-gray-400 dark:text-[#8891b0]"
          >
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-violet-500 dark:text-violet-400" /> No signup required</span>
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-violet-500 dark:text-violet-400" /> 30-second setup</span>
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-violet-500 dark:text-violet-400" /> Free forever</span>
          </motion.div>

          {/* Product screenshot mockup — Pipeline view */}
          <motion.div
            variants={fadeUp}
            className="mt-14 w-full max-w-4xl"
          >
            <PipelineMockup />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

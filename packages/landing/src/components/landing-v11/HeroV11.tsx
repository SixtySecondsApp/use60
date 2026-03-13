import { useState, useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Globe, Check, Sparkles } from 'lucide-react';
import { AuroraBackground } from './AuroraBackground';
import { ConfettiService } from '../../lib/services/confettiService';

interface HeroV11Props {
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

const MOCK_ROWS = [
  { name: 'Sarah Chen', company: 'Meridian Tech', title: 'VP of Sales', email: 's.chen@meridian.io', linkedin: 'linkedin.com/in/sarchen', status: 'Active' },
  { name: 'James Okafor', company: 'Bolt Systems', title: 'Head of Revenue', email: 'james@boltsys.com', linkedin: 'linkedin.com/in/jokafor', status: 'Replied' },
  { name: 'Priya Sharma', company: 'NovaBridge', title: 'CRO', email: 'priya@novabridge.co', linkedin: 'linkedin.com/in/psharma', status: 'Enriched' },
  { name: 'Tom Briggs', company: 'ScalePoint', title: 'Sales Director', email: 'tom@scalepoint.io', linkedin: 'linkedin.com/in/tbriggs', status: 'Pending' },
  { name: 'Maria Lopez', company: 'CloudNine HQ', title: 'GTM Lead', email: 'maria@cloudninehq.com', linkedin: 'linkedin.com/in/mlopez', status: 'Active' },
];

function OpsTableMockup() {
  return (
    <div className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#111] shadow-2xl shadow-black/5 dark:shadow-black/30 overflow-hidden">
      {/* Table header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Bristol Local Leaders</h3>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <Sparkles className="w-2.5 h-2.5" /> AI
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <button className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/5 transition-colors">
            Enrich All
          </button>
          <button className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/5 transition-colors">
            Create Sequence
          </button>
          <button className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-600 dark:bg-emerald-500 text-white hover:bg-blue-700 dark:hover:bg-emerald-600 transition-colors">
            Push to LinkedIn
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 dark:border-white/5">
              {['Name', 'Company', 'Title', 'Email', 'LinkedIn', 'Sequence Status'].map((col) => (
                <th
                  key={col}
                  className="px-4 py-2 text-[11px] font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_ROWS.map((row, i) => (
              <tr
                key={row.name}
                className={`border-b border-gray-50 dark:border-white/[0.03] ${
                  i % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-gray-50/30 dark:bg-white/[0.01]'
                }`}
              >
                <td className="px-4 py-2 text-xs font-medium text-gray-900 dark:text-white whitespace-nowrap">{row.name}</td>
                <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{row.company}</td>
                <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{row.title}</td>
                <td className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{row.email}</td>
                <td className="px-4 py-2 text-xs text-blue-500 dark:text-emerald-400 whitespace-nowrap">{row.linkedin}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      row.status === 'Active'
                        ? 'bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400'
                        : row.status === 'Replied'
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
                          : row.status === 'Enriched'
                            ? 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400'
                            : 'bg-gray-50 text-gray-500 dark:bg-white/5 dark:text-gray-400'
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HeroV11({ onTryDemo }: HeroV11Props) {
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
    <section ref={sectionRef} className="relative bg-white dark:bg-[#0a0a0a] overflow-hidden">
      <AuroraBackground />

      {/* Subtle decorative elements — Harmonic-style colored bricks with parallax */}
      <motion.div
        style={{ y: brick1Y }}
        className="absolute top-32 left-8 w-3 h-12 bg-blue-500/20 dark:bg-emerald-500/10 rounded-sm hidden lg:block"
        aria-hidden="true"
      />
      <motion.div
        style={{ y: brick2Y }}
        className="absolute top-48 left-14 w-2 h-8 bg-gray-300/30 dark:bg-gray-500/10 rounded-sm hidden lg:block"
        aria-hidden="true"
      />
      <motion.div
        style={{ y: brick3Y }}
        className="absolute top-36 right-12 w-3 h-10 bg-rose-400/15 dark:bg-rose-400/10 rounded-sm hidden lg:block"
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
            className="font-display font-extrabold text-5xl md:text-7xl tracking-tight text-gray-900 dark:text-white leading-[1.08]"
          >
            Your AI Sales Team
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={fadeUp}
            className="mt-6 text-gray-500 dark:text-gray-400 text-xl font-body max-w-2xl leading-relaxed"
          >
            60 is the command center that finds leads, runs outreach, preps meetings,
            follows up, and keeps your pipeline moving — so your team only focuses on closing.
          </motion.p>

          {/* Demo URL form */}
          <motion.form
            variants={fadeUp}
            onSubmit={handleDemoSubmit}
            className="mt-10 flex flex-col sm:flex-row gap-3 w-full max-w-md"
          >
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
                placeholder="yourcompany.com"
                className="w-full pl-10 pr-4 py-3 rounded-lg border text-sm font-body
                  bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400
                  focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-emerald-500 focus:border-transparent focus:bg-white
                  dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-gray-500
                  dark:focus:bg-white/10
                  transition-all"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-3 rounded-lg text-sm font-semibold
                bg-blue-600 text-white hover:bg-blue-700
                dark:bg-emerald-500 dark:hover:bg-emerald-600
                transition-all hover:translate-y-[-1px] hover:shadow-lg
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-emerald-500 focus-visible:ring-offset-2
                dark:focus-visible:ring-offset-[#0a0a0a]
                flex items-center justify-center gap-2"
            >
              Try the demo
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.form>

          {/* Example domain buttons */}
          <motion.div
            variants={fadeUp}
            className="mt-3 flex flex-wrap items-center justify-center gap-2"
          >
            <span className="text-xs text-gray-400 dark:text-gray-500">Try:</span>
            {exampleDomains.map((domain) => (
              <button
                key={domain}
                type="button"
                onClick={() => handleExampleClick(domain)}
                className="px-2.5 py-1 rounded-md text-xs font-medium border
                  border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600
                  dark:border-white/10 dark:text-gray-400 dark:hover:border-emerald-500/30 dark:hover:text-emerald-400
                  transition-colors"
              >
                {domain}
              </button>
            ))}
          </motion.div>

          {/* Trust micro-copy */}
          <motion.div
            variants={fadeUp}
            className="mt-4 flex items-center justify-center gap-6 text-xs text-gray-400 dark:text-gray-500"
          >
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-blue-500 dark:text-emerald-400" /> No credit card</span>
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-blue-500 dark:text-emerald-400" /> Works with your CRM</span>
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-blue-500 dark:text-emerald-400" /> Live in 48 hours</span>
          </motion.div>

          {/* Product screenshot mockup */}
          <motion.div
            variants={fadeUp}
            className="mt-14 w-full max-w-4xl"
          >
            <OpsTableMockup />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

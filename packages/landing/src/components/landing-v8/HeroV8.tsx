import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Globe } from 'lucide-react';

interface HeroV8Props {
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

export function HeroV8({ onTryDemo }: HeroV8Props) {
  const [demoUrl, setDemoUrl] = useState('');

  const handleDemoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (demoUrl.trim()) onTryDemo(demoUrl.trim());
  };

  const handleExampleClick = (domain: string) => {
    setDemoUrl(domain);
    onTryDemo(domain);
  };

  return (
    <section className="relative bg-white dark:bg-[#0a0a0a] overflow-hidden">
      {/* Subtle decorative elements — Harmonic-style colored bricks */}
      <div className="absolute top-32 left-8 w-3 h-12 bg-blue-500/20 dark:bg-emerald-500/10 rounded-sm hidden lg:block" aria-hidden="true" />
      <div className="absolute top-48 left-14 w-2 h-8 bg-gray-300/30 dark:bg-gray-500/10 rounded-sm hidden lg:block" aria-hidden="true" />
      <div className="absolute top-36 right-12 w-3 h-10 bg-rose-400/15 dark:bg-rose-400/10 rounded-sm hidden lg:block" aria-hidden="true" />
      <div className="absolute top-52 right-20 w-2 h-6 bg-gray-300/20 dark:bg-gray-500/8 rounded-sm hidden lg:block" aria-hidden="true" />

      <div className="max-w-6xl mx-auto px-6 pt-32 pb-16 md:pt-40 md:pb-24">
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
            Everything before and
            <br />
            after the call
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={fadeUp}
            className="mt-6 text-gray-500 dark:text-gray-400 text-xl font-body max-w-2xl leading-relaxed"
          >
            60 is the AI command center for sales. Follow-ups, meeting prep,
            pipeline hygiene — handled before you think about it.
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
              Show me
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

          {/* Micro-copy */}
          <motion.p
            variants={fadeUp}
            className="mt-3 text-gray-400 dark:text-gray-500 text-sm font-body"
          >
            30 seconds. No signup required.
          </motion.p>
        </motion.div>

        {/* Product screenshot mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mt-16 relative"
        >
          <div className="relative bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden shadow-2xl shadow-blue-500/5 dark:shadow-emerald-500/10">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-white/10 bg-white dark:bg-[#0a0a0a]">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400/80 dark:bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-400/80 dark:bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-400/80 dark:bg-green-500/60" />
              </div>
              <div className="flex-1 mx-8">
                <div className="bg-gray-100 dark:bg-white/5 rounded-md px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 font-mono text-center border border-gray-200/50 dark:border-white/5">
                  app.use60.com
                </div>
              </div>
            </div>

            {/* Product UI mockup */}
            <div className="p-6 md:p-8 bg-gradient-to-b from-gray-50 to-white dark:from-[#111] dark:to-[#0d0d0d] min-h-[280px] md:min-h-[400px]">
              {/* Sidebar + Main content mockup */}
              <div className="flex gap-6">
                {/* Sidebar */}
                <div className="hidden md:flex flex-col gap-3 w-48 shrink-0">
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-emerald-500/10 text-blue-700 dark:text-emerald-400 rounded-lg text-xs font-medium">
                    <div className="w-4 h-4 bg-blue-600 dark:bg-emerald-500 rounded" />
                    Pipeline
                  </div>
                  {['Meetings', 'Follow-ups', 'Contacts', 'Prospecting'].map((item) => (
                    <div key={item} className="flex items-center gap-2 px-3 py-2 text-gray-400 dark:text-gray-500 text-xs">
                      <div className="w-4 h-4 bg-gray-200 dark:bg-white/10 rounded" />
                      {item}
                    </div>
                  ))}
                </div>

                {/* Main content area */}
                <div className="flex-1 space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">Pipeline Overview</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">12 active deals &middot; $847K weighted</div>
                    </div>
                    <div className="flex gap-2">
                      <div className="px-3 py-1.5 bg-blue-600 dark:bg-emerald-500 text-white text-xs rounded-md font-medium">3 follow-ups ready</div>
                    </div>
                  </div>

                  {/* Deal cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      { name: 'TechCorp', stage: 'Discovery', value: '$120K', signal: 'Meeting tomorrow' },
                      { name: 'Acme Inc', stage: 'Proposal', value: '$85K', signal: 'Follow-up ready' },
                      { name: 'CloudBase', stage: 'Negotiation', value: '$200K', signal: 'Renewal in 14d' },
                    ].map((deal) => (
                      <div key={deal.name} className="bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-white/5 rounded-lg p-3 shadow-sm dark:shadow-none">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-900 dark:text-white">{deal.name}</span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{deal.value}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">{deal.stage}</div>
                        <div className="text-[10px] px-2 py-1 bg-blue-50 dark:bg-emerald-500/10 text-blue-600 dark:text-emerald-400 rounded-md inline-block font-medium">
                          {deal.signal}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Activity feed preview */}
                  <div className="bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-white/5 rounded-lg p-3 shadow-sm dark:shadow-none">
                    <div className="text-xs font-semibold text-gray-900 dark:text-white mb-2">Recent Activity</div>
                    {[
                      'Follow-up sent to Sarah Chen at TechCorp',
                      'Meeting prep delivered for Acme discovery call',
                      'Pipeline alert: Payflow stuck in Proposal (18 days)',
                    ].map((activity, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-emerald-500 shrink-0" />
                        {activity}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

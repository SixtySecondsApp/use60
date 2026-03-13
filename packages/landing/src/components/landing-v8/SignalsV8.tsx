import { motion } from 'framer-motion';
import { Bell, Users, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Signal {
  icon: LucideIcon;
  name: string;
  description: string;
  examples: string[];
}

const SIGNALS: Signal[] = [
  {
    icon: Bell,
    name: 'Deal alerts',
    description: 'Stale deals, missing next steps, pipeline anomalies — flagged before you notice.',
    examples: [
      'Deal stuck in Proposal for 18 days',
      'No activity on $120K opportunity in 9 days',
      'Multi-threading gap: only 1 contact engaged',
    ],
  },
  {
    icon: Users,
    name: 'Buyer signals',
    description: 'Emails opened, pages visited, proposals viewed — timing your outreach to intent.',
    examples: [
      'Prospect opened pricing email 3x in 24h',
      'New stakeholder viewed your case study',
      'Champion went silent after objection',
    ],
  },
  {
    icon: TrendingUp,
    name: 'Pipeline momentum',
    description: 'Deals progressing, stages updating, renewal windows approaching — automated hygiene.',
    examples: [
      'TechCorp auto-moved to Discovery after call',
      'Renewal in 14 days — email ready',
      'Weekly pipeline digest with 3 deals advanced',
    ],
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

export function SignalsV8() {
  return (
    <section className="bg-gray-50 dark:bg-[#111] py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-16"
        >
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-500 mb-4 tracking-wide uppercase">
            Signals
          </p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            Reach out when the time is right
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            Automated, event-based intelligence that tells you what needs attention and why — so every touchpoint is perfectly timed.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {SIGNALS.map((signal) => {
            const Icon = signal.icon;
            return (
              <motion.div
                key={signal.name}
                variants={fadeUp}
                className="bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-white/10 rounded-xl p-6 hover:border-gray-300 dark:hover:border-white/20 hover:shadow-sm dark:hover:shadow-none transition-all"
              >
                <div className="w-10 h-10 bg-gray-100 dark:bg-white/5 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </div>
                <h3 className="font-display font-bold text-lg text-gray-900 dark:text-white mb-2">{signal.name}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm font-body leading-relaxed mb-4">
                  {signal.description}
                </p>
                <div className="space-y-2">
                  {signal.examples.map((example) => (
                    <div key={example} className="flex items-start gap-2 text-xs text-gray-400 dark:text-gray-500 font-body">
                      <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mt-1.5 shrink-0" />
                      {example}
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

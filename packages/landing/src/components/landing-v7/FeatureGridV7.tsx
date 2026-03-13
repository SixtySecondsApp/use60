import { motion } from 'framer-motion';
import { Mail, Calendar, Target, Activity, Search, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

interface FeatureCard {
  icon: LucideIcon;
  title: string;
  description: string;
  subItems: string[];
  badge?: string;
}

const FEATURES: FeatureCard[] = [
  {
    icon: Mail,
    title: 'Follow-up automation',
    description:
      'Post-meeting recaps, re-engagement sequences, no-show recovery, renewal reminders \u2014 8 types of follow-up, all drafted in your voice.',
    subItems: [
      'Post-meeting',
      'Triage',
      'No-show',
      'Renewal',
      'Trial',
      'Re-engagement',
      'Warm intros',
      'Reply drafts',
    ],
    badge: '8 skills',
  },
  {
    icon: Calendar,
    title: 'Meeting intelligence',
    description:
      'Stakeholder history, talking points, competitor intel, risk flags \u2014 auto-delivered to Slack 2 hours before every call.',
    subItems: [
      'Pre-meeting brief',
      'Action extraction',
      'Objection tracking',
      'Competitive intel',
      'Weekly digest',
      'Coaching',
    ],
    badge: '8 skills',
  },
  {
    icon: Target,
    title: 'Deal lifecycle',
    description:
      'Health scoring, slippage alerts, rescue plans, stakeholder mapping \u2014 60 watches every deal and flags before you\u2019d notice.',
    subItems: [
      'Health scoring',
      'Slippage',
      'Rescue plans',
      'Deal mapping',
      'Next actions',
      'Auto-tagging',
      'Handoff briefs',
    ],
    badge: '9 skills',
  },
  {
    icon: Activity,
    title: 'Pipeline hygiene',
    description:
      'Stale deal detection, missing next steps, contact freshness, automatic stage updates \u2014 your CRM stays current without you touching it.',
    subItems: [
      'Stale detection',
      'Missing steps',
      'Stage accuracy',
      'Follow-up gaps',
      'Weekly digest',
      'Focus tasks',
    ],
  },
  {
    icon: Search,
    title: 'Prospecting & research',
    description:
      'Company research, decision-maker search, ICP matching, intent signals \u2014 across Apollo, AI Ark, Explorium, and Apify.',
    subItems: [
      'Lead research',
      'Company analysis',
      'People search',
      'Similarity',
      'Intent signals',
      'Enrichment',
      'Scraping',
    ],
    badge: '14 skills',
  },
  {
    icon: Zap,
    title: 'Daily workflow',
    description:
      'Morning brief with priorities. Focus planner with capacity. Catch-me-up when you\u2019ve been in meetings. End-of-day digest.',
    subItems: [
      'Morning brief',
      'Focus planner',
      'Catch-me-up',
      'Daily digest',
      'Task creation',
      'Notifications',
    ],
  },
];

export function FeatureGridV7() {
  return (
    <section id="features" className="bg-[#0c0c0c] py-28 md:py-36">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="max-w-3xl mb-14"
        >
          <motion.p
            variants={fadeUp}
            className="text-stone-500 text-sm font-medium tracking-wide uppercase mb-4"
          >
            Features
          </motion.p>

          <motion.h2
            variants={fadeUp}
            className="font-display font-bold text-4xl md:text-5xl tracking-tight text-stone-100 leading-[1.1]"
          >
            Everything before and after the call.
          </motion.h2>

          <motion.p
            variants={fadeUp}
            className="mt-6 text-stone-400 text-lg leading-relaxed"
          >
            127 skills. 25 sequences. One command center.
          </motion.p>
        </motion.div>

        {/* Grid */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                variants={fadeUp}
                className="bg-[#161616] border border-white/[0.08] rounded-xl p-6
                  hover:border-white/[0.14] transition-colors flex flex-col"
              >
                <Icon className="w-5 h-5 text-purple-400 mb-4" />

                <h3 className="font-display font-bold text-stone-100 text-lg mb-2">
                  {feature.title}
                </h3>

                <p className="text-stone-400 text-sm leading-relaxed mb-5 flex-1">
                  {feature.description}
                </p>

                {/* Sub-items */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {feature.subItems.map((item) => (
                    <span
                      key={item}
                      className="text-xs bg-white/[0.04] rounded-full px-2.5 py-1 text-stone-500"
                    >
                      {item}
                    </span>
                  ))}
                </div>

                {/* Badge */}
                {feature.badge && (
                  <span className="font-mono text-xs text-purple-400">
                    {feature.badge}
                  </span>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

import { motion } from 'framer-motion';
import { Mail, Calendar, Target, Activity, Search, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  name: string;
  headline: string;
  description: string;
  skills: string[];
  count?: string;
}

const FEATURES: Feature[] = [
  {
    icon: Mail,
    name: 'Follow-up Automation',
    headline: 'Follow-ups that actually happen',
    description:
      'Post-meeting recaps, re-engagement sequences, no-show recovery, renewal reminders — 8 types of follow-up, all drafted in your voice.',
    skills: ['Post-meeting', 'Triage', 'No-show', 'Renewal', 'Trial', 'Re-engagement', 'Warm intros', 'Reply drafts'],
    count: '8 skills',
  },
  {
    icon: Calendar,
    name: 'Meeting Intelligence',
    headline: 'Meeting prep in 30 seconds',
    description:
      'Stakeholder history, talking points, competitor intel, risk flags — auto-delivered to Slack 2 hours before every call.',
    skills: ['Pre-meeting brief', 'Action extraction', 'Objection tracking', 'Competitive intel', 'Weekly digest', 'Coaching'],
    count: '8 skills',
  },
  {
    icon: Target,
    name: 'Deal Lifecycle',
    headline: "Deals that don't slip",
    description:
      'Health scoring, slippage alerts, rescue plans, stakeholder mapping — 60 watches every deal and flags before you notice.',
    skills: ['Health scoring', 'Slippage diagnosis', 'Rescue plans', 'Deal mapping', 'Next best actions', 'Handoff briefs'],
    count: '9 skills',
  },
  {
    icon: Activity,
    name: 'Pipeline Hygiene',
    headline: 'Pipeline that cleans itself',
    description:
      'Stale deal detection, missing next steps, automatic stage updates — your CRM stays current without you touching it.',
    skills: ['Stale detection', 'Missing next steps', 'Stage accuracy', 'Follow-up gaps', 'Hygiene digest', 'Focus tasks'],
  },
  {
    icon: Search,
    name: 'Prospecting & Research',
    headline: 'Know everything before you reach out',
    description:
      'Company research, decision-maker search, ICP matching, intent signals — across Apollo, AI Ark, Explorium, and Apify.',
    skills: ['Lead research', 'Company analysis', 'People search', 'Similarity matching', 'Intent signals', 'Enrichment'],
    count: '14 skills',
  },
  {
    icon: Zap,
    name: 'Daily Workflow',
    headline: 'Start every day with clarity',
    description:
      'Morning brief with priorities. Focus planner with capacity. Catch-me-up when you have been in meetings. End-of-day digest.',
    skills: ['Morning brief', 'Focus planner', 'Catch-me-up', 'Daily digest', 'Task creation', 'Slack notifications'],
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
  show: { transition: { staggerChildren: 0.08 } },
};

export function FeatureGridV8() {
  return (
    <section className="bg-white dark:bg-[#0a0a0a] py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="text-center mb-16"
        >
          <p className="text-sm font-medium text-blue-600 dark:text-emerald-500 mb-4 tracking-wide uppercase">
            Capabilities
          </p>
          <h2 className="font-display font-bold text-3xl md:text-4xl text-gray-900 dark:text-white tracking-tight">
            127 skills. One command center.
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-lg font-body max-w-2xl mx-auto">
            Everything before and after the call — organized into focused skill sets that chain together automatically.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.name}
                variants={fadeUp}
                className="bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-white/10 rounded-xl p-6 hover:border-gray-300 dark:hover:border-white/20 hover:bg-white dark:hover:bg-white/5 hover:shadow-sm dark:hover:shadow-none transition-all group"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl flex items-center justify-center group-hover:border-gray-300 dark:group-hover:border-white/20 transition-colors">
                    <Icon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  </div>
                  {feature.count && (
                    <span className="text-xs font-medium text-blue-600 dark:text-emerald-500 bg-blue-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full">
                      {feature.count}
                    </span>
                  )}
                </div>

                <h3 className="font-display font-bold text-lg text-gray-900 dark:text-white mb-2">{feature.headline}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm font-body leading-relaxed mb-4">
                  {feature.description}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {feature.skills.map((skill) => (
                    <span
                      key={skill}
                      className="text-[11px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded"
                    >
                      {skill}
                    </span>
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

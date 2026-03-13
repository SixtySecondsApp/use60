import { motion } from 'framer-motion';
import {
  Users,
  FileText,
  Activity,
  MessageSquare,
  Swords,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
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
    transition: { duration: 0.6, ease: [0.25, 0.4, 0, 1] },
  },
};

interface BriefItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

const BRIEF_ITEMS: BriefItem[] = [
  {
    icon: Users,
    title: 'Stakeholders',
    description:
      'Everyone on the call: name, title, role in the deal, how many times you\u2019ve met',
  },
  {
    icon: FileText,
    title: 'Deal context',
    description: 'Stage, age, value, source, key dates, open tasks',
  },
  {
    icon: Activity,
    title: 'Recent activity',
    description:
      'Emails opened, pages visited, proposals viewed, with timestamps',
  },
  {
    icon: MessageSquare,
    title: 'Talking points',
    description:
      'AI-generated based on deal stage, recent signals, and objection history',
  },
  {
    icon: Swords,
    title: 'Competitor intel',
    description:
      'If competitors were mentioned in any past call, surfaced with positioning notes',
  },
  {
    icon: AlertTriangle,
    title: 'Risk flags',
    description:
      'Multi-threading gaps, stale contacts, missing next steps',
  },
];

interface TimelineStep {
  time: string;
  label: string;
}

const TIMELINE_STEPS: TimelineStep[] = [
  { time: '8:00 AM', label: 'Briefs generated' },
  { time: '8:30 AM', label: 'Delivered to Slack' },
  { time: '9:00 AM', label: "Prep done. Coffee\u2019s still warm." },
];

export function DeepDiveMeetingPrepV7() {
  return (
    <section className="bg-[#0c0c0c] py-28 md:py-36">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-40px' }}
          className="mb-16"
        >
          <motion.p
            variants={fadeUp}
            className="text-xs uppercase tracking-widest text-stone-500 font-medium mb-4"
          >
            Meeting prep
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="font-display font-bold text-4xl md:text-5xl text-stone-100 tracking-tight"
          >
            30 seconds instead of 30 minutes.
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-5 text-stone-400 text-lg max-w-3xl"
          >
            Two hours before every meeting, a prep brief lands in your Slack.
            Stakeholder history, deal context, recent emails, talking points,
            competitor intel &mdash; everything you need to walk in sharp.
          </motion.p>
        </motion.div>

        {/* What the brief contains */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-40px' }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-20"
        >
          {BRIEF_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                variants={fadeUp}
                className="bg-[#161616] border border-white/[0.08] rounded-xl p-5 hover:border-white/[0.14] transition-colors"
              >
                <Icon className="w-5 h-5 text-purple-400 mb-3" />
                <h3 className="text-stone-100 text-sm font-medium mb-1">
                  {item.title}
                </h3>
                <p className="text-stone-500 text-sm leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Morning sequence timeline */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-40px' }}
          className="flex flex-col md:flex-row items-start md:items-center justify-center gap-4 md:gap-0"
        >
          {TIMELINE_STEPS.map((step, i) => (
            <motion.div
              key={step.time}
              variants={fadeUp}
              className="flex items-center gap-4 md:gap-0"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-stone-400">
                  {step.time}
                </span>
                <span className="text-stone-500 text-sm">
                  &mdash;
                </span>
                <span className="text-stone-400 text-sm">
                  {step.label}
                </span>
              </div>
              {i < TIMELINE_STEPS.length - 1 && (
                <ChevronRight className="hidden md:block w-4 h-4 text-stone-600 mx-5 shrink-0" />
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

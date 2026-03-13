import { motion } from 'framer-motion';
import {
  Mail,
  Inbox,
  UserX,
  RotateCcw,
  Rocket,
  Ghost,
  Users,
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

interface Step {
  number: string;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    number: '1',
    title: 'Meeting ends \u2192 transcript processed',
    description:
      '60 extracts action items, decisions, objections raised, and next steps from the transcript. Not a summary \u2014 structured intelligence.',
  },
  {
    number: '2',
    title: 'AI drafts follow-up with deal context',
    description:
      "The draft references specific things discussed, ties back to the deal stage, and addresses objections raised. It sounds like you because it\u2019s learned from your edits.",
  },
  {
    number: '3',
    title: 'Appears in Slack \u2192 Send / Edit / Dismiss',
    description:
      'No app to open. No tab to check. The draft is in your Slack DM, ready to go. Edit inline if you want. One tap to send.',
  },
];

interface SubCapability {
  icon: LucideIcon;
  name: string;
  description: string;
}

const SUB_CAPABILITIES: SubCapability[] = [
  {
    icon: Mail,
    name: 'Post-meeting follow-up',
    description: 'Full recap from transcript + deal context',
  },
  {
    icon: Inbox,
    name: 'Follow-up triage',
    description: 'Flags threads needing reply, ranked by urgency',
  },
  {
    icon: UserX,
    name: 'No-show recovery',
    description: 'Gracious reschedule email, auto-drafted',
  },
  {
    icon: RotateCcw,
    name: 'Renewal reminders',
    description: '60 days before contract ends, email ready',
  },
  {
    icon: Rocket,
    name: 'Trial conversion',
    description: 'Day 7 check-in and Day 12 conversion emails',
  },
  {
    icon: Ghost,
    name: 'Re-engagement',
    description: '9+ days silent? Multi-channel plan ready',
  },
  {
    icon: Users,
    name: 'Warm intros',
    description: 'Introduction emails personalized and ready',
  },
];

export function DeepDiveFollowupsV7() {
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
            Follow-ups
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="font-display font-bold text-4xl md:text-5xl text-stone-100 tracking-tight"
          >
            Every meeting gets a next step. Automatically.
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-5 text-stone-400 text-lg max-w-3xl"
          >
            The meeting ends. Within two hours, a personalized follow-up appears
            in your Slack &mdash; written in your voice, with full awareness of
            the deal, the buyer, and what was discussed. One tap to send.
          </motion.p>
        </motion.div>

        {/* Steps — vertical timeline */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-40px' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 mb-20"
        >
          {STEPS.map((step, i) => (
            <motion.div key={step.number} variants={fadeUp} className="relative flex gap-4">
              {/* Connecting line (between steps on desktop) */}
              {i < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-4 left-[calc(50%+24px)] right-0 h-px bg-white/[0.08]" />
              )}

              <div className="flex flex-col items-start">
                <div className="w-8 h-8 rounded-full bg-purple-400/10 flex items-center justify-center shrink-0 mb-4">
                  <span className="font-mono text-sm text-purple-400">
                    {step.number}
                  </span>
                </div>
                <h3 className="font-display font-bold text-stone-100 text-base mb-2">
                  {step.title}
                </h3>
                <p className="text-stone-400 text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Sub-capabilities grid */}
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-40px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {SUB_CAPABILITIES.map((cap) => {
            const Icon = cap.icon;
            return (
              <motion.div
                key={cap.name}
                variants={fadeUp}
                className="flex items-start gap-3 p-4"
              >
                <Icon className="w-4 h-4 text-stone-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-stone-100 text-sm font-medium">
                    {cap.name}
                  </p>
                  <p className="text-stone-500 text-sm">{cap.description}</p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

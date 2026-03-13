import { motion } from 'framer-motion';
import { AlertCircle, Clock, TrendingDown, Layers } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface PainCard {
  icon: LucideIcon;
  title: string;
  body: string;
}

const PAIN_CARDS: PainCard[] = [
  {
    icon: AlertCircle,
    title: 'Follow-ups forgotten',
    body: "Meeting ends. Intent is high. Three days pass. The prospect goes cold. Not because you didn\u2019t care \u2014 because nothing reminded you.",
  },
  {
    icon: Clock,
    title: 'Meeting prep takes hours',
    body: "You\u2019re pulling up LinkedIn, digging through email threads, checking the CRM, scanning old notes. For every meeting. Every day.",
  },
  {
    icon: TrendingDown,
    title: 'Pipeline goes stale',
    body: "Deals sit in \u2018Proposal\u2019 for weeks because nobody flagged them. By the time you notice, the buyer\u2019s moved on.",
  },
  {
    icon: Layers,
    title: 'Context is everywhere',
    body: 'The deal history is in your CRM. The meeting notes are in Fathom. The emails are in Gmail. The tasks are in your head. Nothing has the full picture.',
  },
];

const container = {
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

export function ProblemV7() {
  return (
    <section className="bg-[#0c0c0c] py-28 md:py-36">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="max-w-3xl"
        >
          <motion.p
            variants={fadeUp}
            className="text-stone-500 text-sm font-medium font-body tracking-wide uppercase mb-4"
          >
            The problem
          </motion.p>

          <motion.h2
            variants={fadeUp}
            className="font-display font-bold text-4xl md:text-5xl tracking-tight text-stone-100 leading-[1.1]"
          >
            Five tools. Zero awareness of each other.
          </motion.h2>

          <motion.p
            variants={fadeUp}
            className="mt-6 text-stone-400 text-lg font-body leading-relaxed"
          >
            Your CRM doesn&apos;t know what happened in the meeting. Your
            notetaker doesn&apos;t know what&apos;s in your pipeline. Your email
            doesn&apos;t know what&apos;s due. Every tool works alone. Nothing
            connects.
          </motion.p>
        </motion.div>

        {/* Pain cards grid */}
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {PAIN_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.title}
                variants={fadeUp}
                className="bg-[#161616] border border-white/[0.08] rounded-xl p-6
                  hover:border-white/[0.14] transition-colors"
              >
                <Icon className="w-5 h-5 text-stone-500 mb-4" />
                <h3 className="font-display font-bold text-stone-100 text-lg mb-2">
                  {card.title}
                </h3>
                <p className="text-stone-400 text-base font-body leading-relaxed">
                  {card.body}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
